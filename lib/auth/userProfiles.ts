import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export interface UserProfile {
  id: string;
  supabase_auth_user_id: string | null;
  display_name: string;
  created_at: string;
  updated_at: string;
}

interface UserProfileRow {
  id: string;
  supabase_auth_user_id: string | null;
  display_name: string;
  created_at: string;
  updated_at: string;
}

const userProfileSelect = "id, supabase_auth_user_id, display_name, created_at, updated_at";
const getSupabaseProfileClient = (supabaseClient?: SupabaseClient | null) => supabaseClient ?? getSupabaseAdminClient();

const toUserProfile = (row: UserProfileRow | null | undefined): UserProfile | null => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    supabase_auth_user_id: row.supabase_auth_user_id,
    display_name: row.display_name,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
};

const randomFourDigits = () => Math.floor(1000 + Math.random() * 9000);

export const generatePoopinDisplayName = () => `poopin${randomFourDigits()}`;

export const getUserProfileBySupabaseAuthUserId = async (
  supabaseAuthUserId: string,
  supabaseClient?: SupabaseClient | null
): Promise<UserProfile | null> => {
  const normalizedId = supabaseAuthUserId.trim();
  if (!normalizedId) {
    return null;
  }

  const supabase = getSupabaseProfileClient(supabaseClient);
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(userProfileSelect)
    .eq("supabase_auth_user_id", normalizedId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return toUserProfile(data as UserProfileRow | null);
};

interface EnsureUserProfileOptions {
  supabaseClient?: SupabaseClient | null;
}

export const ensureUserProfileForAuthUser = async (
  user: Pick<User, "id"> | null | undefined,
  options?: EnsureUserProfileOptions
): Promise<UserProfile | null> => {
  const supabaseAuthUserId = typeof user?.id === "string" ? user.id.trim() : "";
  if (!supabaseAuthUserId) {
    return null;
  }

  const supabase = getSupabaseProfileClient(options?.supabaseClient);
  if (!supabase) {
    return null;
  }

  const existingProfile = await getUserProfileBySupabaseAuthUserId(supabaseAuthUserId, supabase);
  if (existingProfile) {
    return existingProfile;
  }

  const displayName = generatePoopinDisplayName();
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      supabase_auth_user_id: supabaseAuthUserId,
      display_name: displayName
    })
    .select(userProfileSelect)
    .maybeSingle();

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("duplicate") || message.includes("unique")) {
      return getUserProfileBySupabaseAuthUserId(supabaseAuthUserId, supabase);
    }

    throw new Error(error.message);
  }

  return toUserProfile(data as UserProfileRow | null);
};

export const getUserProfilesByIds = async (ids: string[]): Promise<Map<string, UserProfile>> => {
  const uniqueIds = [...new Set(ids.filter((id) => id.trim().length > 0))];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const supabase = getSupabaseProfileClient();
  if (!supabase) {
    return new Map();
  }

  const { data, error } = await supabase.from("profiles").select(userProfileSelect).in("id", uniqueIds);
  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as UserProfileRow[])
      .map((row) => toUserProfile(row))
      .filter((row): row is UserProfile => row !== null)
      .map((row) => [row.id, row])
  );
};

interface UpdateUserDisplayNameOptions {
  supabaseClient?: SupabaseClient | null;
  supabaseAuthUserId?: string | null;
}

export const updateUserDisplayName = async (
  profileId: string,
  displayName: string,
  options?: UpdateUserDisplayNameOptions
): Promise<UserProfile> => {
  const supabase = getSupabaseProfileClient(options?.supabaseClient);
  if (!supabase) {
    throw new Error("Profile updates are temporarily unavailable.");
  }

  let query = supabase
    .from("profiles")
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq("id", profileId);

  if (options?.supabaseAuthUserId) {
    query = query.eq("supabase_auth_user_id", options.supabaseAuthUserId);
  }

  const { data, error } = await query.select(userProfileSelect).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const profile = toUserProfile(data as UserProfileRow | null);
  if (!profile) {
    throw new Error("Could not load the updated profile.");
  }

  return profile;
};

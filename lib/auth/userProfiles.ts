import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export interface UserProfile {
  id: string;
  supabase_auth_user_id: string | null;
  display_name: string;
  active_card_key: string | null;
  created_at: string;
  updated_at: string;
}

interface UserProfileRow {
  id: string;
  supabase_auth_user_id: string | null;
  display_name: string;
  active_card_key: string | null;
  created_at: string;
  updated_at: string;
}

const userProfileSelect = "id, supabase_auth_user_id, display_name, active_card_key, created_at, updated_at";
const getSupabaseProfileClient = (supabaseClient?: SupabaseClient | null) => supabaseClient ?? getSupabaseAdminClient();
const GENERATED_DISPLAY_NAME_MAX_ATTEMPTS = 24;

type ProfileMutationErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const toUserProfile = (row: UserProfileRow | null | undefined): UserProfile | null => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    supabase_auth_user_id: row.supabase_auth_user_id,
    display_name: row.display_name,
    active_card_key: row.active_card_key,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
};

const randomDigits = (digits: number) => {
  const minimum = 10 ** (digits - 1);
  const maximum = 10 ** digits;
  return Math.floor(minimum + Math.random() * (maximum - minimum));
};

const getGeneratedDisplayNameDigits = (attempt: number) => {
  if (attempt < 12) {
    return 4;
  }

  if (attempt < 20) {
    return 5;
  }

  return 6;
};

export const generatePoopinDisplayName = (attempt = 0) => `poopin${randomDigits(getGeneratedDisplayNameDigits(attempt))}`;

export const normalizeDisplayName = (value: string) => value.trim().replace(/\s+/g, " ");

export class DisplayNameTakenError extends Error {
  constructor() {
    super("That name is already taken. Try another one.");
    this.name = "DisplayNameTakenError";
  }
}

const getErrorText = (error: ProfileMutationErrorLike | null | undefined) =>
  [error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();

const isUniqueViolationError = (error: ProfileMutationErrorLike | null | undefined) =>
  error?.code === "23505" || getErrorText(error).includes("duplicate") || getErrorText(error).includes("unique");

const isDisplayNameConflictError = (error: ProfileMutationErrorLike | null | undefined) => {
  const message = getErrorText(error);
  return isUniqueViolationError(error) && message.includes("display_name");
};

const isSupabaseAuthUserIdConflictError = (error: ProfileMutationErrorLike | null | undefined) => {
  const message = getErrorText(error);
  return isUniqueViolationError(error) && message.includes("supabase_auth_user_id");
};

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

  for (let attempt = 0; attempt < GENERATED_DISPLAY_NAME_MAX_ATTEMPTS; attempt += 1) {
    const displayName = generatePoopinDisplayName(attempt);
    const { data, error } = await supabase
      .from("profiles")
      .insert({
        supabase_auth_user_id: supabaseAuthUserId,
        display_name: displayName
      })
      .select(userProfileSelect)
      .maybeSingle();

    if (!error) {
      return toUserProfile(data as UserProfileRow | null);
    }

    if (isDisplayNameConflictError(error)) {
      continue;
    }

    if (isSupabaseAuthUserIdConflictError(error)) {
      return getUserProfileBySupabaseAuthUserId(supabaseAuthUserId, supabase);
    }

    throw new Error(error.message);
  }

  throw new Error("Could not create a unique display name right now.");
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

interface UpdateUserActiveCardOptions {
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

  const normalizedDisplayName = normalizeDisplayName(displayName);

  let query = supabase
    .from("profiles")
    .update({ display_name: normalizedDisplayName, updated_at: new Date().toISOString() })
    .eq("id", profileId);

  if (options?.supabaseAuthUserId) {
    query = query.eq("supabase_auth_user_id", options.supabaseAuthUserId);
  }

  const { data, error } = await query.select(userProfileSelect).maybeSingle();

  if (error) {
    if (isDisplayNameConflictError(error)) {
      throw new DisplayNameTakenError();
    }

    throw new Error(error.message);
  }

  const profile = toUserProfile(data as UserProfileRow | null);
  if (!profile) {
    throw new Error("Could not load the updated profile.");
  }

  return profile;
};

export const updateUserActiveCardKey = async (
  profileId: string,
  activeCardKey: string | null,
  options?: UpdateUserActiveCardOptions
): Promise<UserProfile> => {
  const supabase = getSupabaseProfileClient(options?.supabaseClient);
  if (!supabase) {
    throw new Error("Profile updates are temporarily unavailable.");
  }

  let query = supabase
    .from("profiles")
    .update({ active_card_key: activeCardKey, updated_at: new Date().toISOString() })
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

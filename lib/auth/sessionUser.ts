import type { User } from "@supabase/supabase-js";

export type PoopinSessionUser = Pick<User, "email" | "user_metadata">;

const normalizeValue = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const getSessionUserDisplayName = (user: Partial<PoopinSessionUser> | null | undefined) => {
  if (!user) {
    return null;
  }

  const userMetadata = typeof user.user_metadata === "object" && user.user_metadata ? user.user_metadata : null;
  return (
    normalizeValue(userMetadata?.poopin_display_name) ??
    normalizeValue(userMetadata?.display_name) ??
    normalizeValue(user.email)
  );
};

export const getSessionUserEmail = (user: Partial<PoopinSessionUser> | null | undefined) => {
  return normalizeValue(user?.email);
};

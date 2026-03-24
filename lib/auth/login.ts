export type ContributionIntent = "review" | "photo" | "add-restroom";

export const CONTRIBUTION_INTENT_PARAM = "intent";
export const RETURN_TO_PARAM = "returnTo";

const toReturnToValue = (pathname: string, intent?: ContributionIntent, hash?: string) => {
  const [pathWithoutHash] = pathname.split("#");
  const [basePath, rawQuery] = pathWithoutHash.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");

  if (intent) {
    searchParams.set(CONTRIBUTION_INTENT_PARAM, intent);
  }

  const queryString = searchParams.toString();
  const normalizedHash = hash ? `#${hash.replace(/^#/, "")}` : "";
  return `${basePath}${queryString ? `?${queryString}` : ""}${normalizedHash}`;
};

export const sanitizeReturnTo = (value: string | string[] | undefined | null) => {
  const resolved = Array.isArray(value) ? value[0] : value;
  if (!resolved || typeof resolved !== "string") {
    return "/";
  }

  if (!resolved.startsWith("/") || resolved.startsWith("//")) {
    return "/";
  }

  return resolved;
};

export const buildLoginHref = (returnTo: string) => {
  const params = new URLSearchParams({ [RETURN_TO_PARAM]: returnTo });
  return `/login?${params.toString()}`;
};

export const buildContributionLoginHref = (pathname: string, intent: ContributionIntent, hash?: string) => {
  return buildLoginHref(toReturnToValue(pathname, intent, hash));
};

export const buildLogoutHref = (returnTo = "/") => {
  const params = new URLSearchParams({ [RETURN_TO_PARAM]: returnTo });
  return `/auth/logout?${params.toString()}`;
};

export const getContributionIntent = (value: string | string[] | undefined | null): ContributionIntent | null => {
  const resolved = Array.isArray(value) ? value[0] : value;
  if (resolved === "review" || resolved === "photo" || resolved === "add-restroom") {
    return resolved;
  }

  return null;
};

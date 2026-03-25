const ROUTE_HISTORY_STORAGE_KEY = "poopin:route-history";
const MAX_ROUTE_HISTORY_ITEMS = 18;

const normalizeRoute = (route: string) => {
  if (!route || typeof route !== "string" || !route.startsWith("/")) {
    return "/";
  }

  return route;
};

export const isSkippableBackRoute = (route: string) => {
  const normalizedRoute = normalizeRoute(route);
  return normalizedRoute === "/login" || normalizedRoute.startsWith("/auth/");
};

const readRouteHistory = () => {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const rawValue = window.sessionStorage.getItem(ROUTE_HISTORY_STORAGE_KEY);
    if (!rawValue) {
      return [] as string[];
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [] as string[];
    }

    return parsed.filter((value): value is string => typeof value === "string" && value.startsWith("/"));
  } catch {
    return [] as string[];
  }
};

const writeRouteHistory = (routes: string[]) => {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(ROUTE_HISTORY_STORAGE_KEY, JSON.stringify(routes.slice(-MAX_ROUTE_HISTORY_ITEMS)));
};

export const rememberNavigationRoute = (route: string) => {
  const normalizedRoute = normalizeRoute(route);
  if (typeof window === "undefined" || isSkippableBackRoute(normalizedRoute)) {
    return;
  }

  const existingHistory = readRouteHistory();
  if (existingHistory[existingHistory.length - 1] === normalizedRoute) {
    return;
  }

  writeRouteHistory([...existingHistory, normalizedRoute]);
};

export const getPreviousMeaningfulRoute = (currentRoute: string) => {
  const normalizedCurrentRoute = normalizeRoute(currentRoute);
  const existingHistory = readRouteHistory();

  for (let index = existingHistory.length - 1; index >= 0; index -= 1) {
    const candidate = existingHistory[index];
    if (!candidate || candidate === normalizedCurrentRoute || isSkippableBackRoute(candidate)) {
      continue;
    }

    return candidate;
  }

  return null;
};

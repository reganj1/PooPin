export const MAPBOX_ACCESS_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

export const isMapboxConfigured = MAPBOX_ACCESS_TOKEN.trim().length > 0;

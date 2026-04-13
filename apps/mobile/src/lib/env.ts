const readEnv = (value: string | undefined) => value?.trim() ?? "";

const requireUrlEnv = (name: "EXPO_PUBLIC_API_BASE_URL" | "EXPO_PUBLIC_SUPABASE_URL") => {
  const value = readEnv(process.env[name]);
  if (!value) {
    const message = `${name} is required for the Poopin mobile app. Add it to apps/mobile/.env.local.`;
    if (__DEV__) {
      throw new Error(message);
    }

    return "";
  }

  try {
    return new URL(value).toString();
  } catch {
    const message = `${name} must be a valid URL.`;
    if (__DEV__) {
      throw new Error(message);
    }

    return "";
  }
};

const requireEnv = (name: "EXPO_PUBLIC_SUPABASE_ANON_KEY") => {
  const value = readEnv(process.env[name]);
  if (value) {
    return value;
  }

  const message = `${name} is required for the Poopin mobile app. Add it to apps/mobile/.env.local.`;
  if (__DEV__) {
    throw new Error(message);
  }

  return "";
};

export const mobileEnv = {
  apiBaseUrl: requireUrlEnv("EXPO_PUBLIC_API_BASE_URL"),
  supabaseUrl: requireUrlEnv("EXPO_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: requireEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY")
} as const;

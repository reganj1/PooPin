export const mobileTheme = {
  colors: {
    pageBackground: "#f8fafc",
    pageAccentTint: "#eef6ff",
    surface: "#ffffff",
    surfaceMuted: "#f8fafc",
    surfaceBrandTint: "#f4f9ff",
    surfaceBrandTintStrong: "#e8f2ff",
    border: "#e2e8f0",
    borderSubtle: "rgba(226, 232, 240, 0.8)",
    textPrimary: "#0f172a",
    textSecondary: "#475569",
    textMuted: "#64748b",
    textFaint: "#94a3b8",
    brand: "#1876f2",
    brandStrong: "#0f5fcb",
    brandDeep: "#0f254a",
    infoTint: "#eff6ff",
    infoBorder: "#bfdbfe",
    errorTint: "#fef2f2",
    errorBorder: "#fecaca",
    errorText: "#b91c1c"
  },
  radii: {
    xs: 12,
    sm: 16,
    md: 20,
    lg: 24,
    xl: 28,
    pill: 999
  },
  spacing: {
    screenX: 20,
    screenTop: 16,
    sectionGap: 18,
    cardPadding: 18,
    heroPadding: 20
  },
  shadows: {
    card: {
      elevation: 2,
      shadowColor: "#0f254a",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 18
    },
    hero: {
      elevation: 3,
      shadowColor: "#0f254a",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 24
    }
  }
} as const;

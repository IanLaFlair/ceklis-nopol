// Token warna & font Ceklis — sama dengan Nopol (PRD §12).
export const colors = {
  ink: "#0E100F",
  paper: "#F2F2EE",
  surface: "#FFFFFF",
  line: "#DCDDD6",
  muted: "#50554F",
  accent: "#F5C518", // teks di atasnya selalu ink
  danger: "#C2410C",
  dangerInk: "#A3440B",
  dangerBg: "#FBEDE6",
  success: "#1E6B3E",
  successBg: "#E5F3EA",
  warning: "#6B5300",
  warningBg: "#FDF3C4",
  plate: "#F4F4F0",
} as const;

export const fonts = {
  display: "'Space Grotesk', sans-serif",
  body: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;

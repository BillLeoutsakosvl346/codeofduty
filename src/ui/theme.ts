export const T = {
  bg: "#0d0b1a",
  surface: "#15122a",
  surfaceHover: "#1d1938",
  border: "#2a2550",
  borderStrong: "#3b3575",
  ink: "#f2f0ff",
  ink2: "#a8a3c7",
  ink3: "#6d6890",
  cyan: "#22e6ff",
  magenta: "#ff3dcb",
  yellow: "#ffe03d",
  violet: "#8b5cff",
  good: "#39ff88",
  warn: "#ffb020",
  bad: "#ff3b5c",
} as const;

export const FONT = "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
export const money = (n: number) => `$${n.toLocaleString()}`;
export const glow = (c: string) => `0 0 12px ${c}66, 0 0 2px ${c}`;

import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Base UI surfaces — a deep slate-charcoal, not pure black
        "base-950": "#0B0E11",
        surface: "#151920",
        "border-subtle": "#262B33",
        "text-primary": "#E8EAED",
        "text-muted": "#8A93A1",

        // Risk semantics — the design's actual color language, driven by
        // the data, not decoration. Kept identical to RISK_COLORS in
        // src/types/geo.ts so Tailwind classes and map paint stay in sync.
        "risk-low": "#5B9279",
        "risk-moderate": "#D9A441",
        "risk-critical": "#C4453C",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        sans: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;

import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── 무채색 시스템 ─────────────────────────────────
        "background":                "#F5F5F5",
        "surface":                   "#FFFFFF",
        "surface-bright":            "#FFFFFF",
        "surface-dim":               "#E0E0E0",
        "surface-variant":           "#EEEEEE",
        "surface-container-lowest":  "#FFFFFF",
        "surface-container-low":     "#F5F5F5",
        "surface-container":         "#EFEFEF",
        "surface-container-high":    "#E8E8E8",
        "surface-container-highest": "#E0E0E0",
        "surface-tint":              "#616161",

        "on-background":             "#1A1A1A",
        "on-surface":                "#1A1A1A",
        "on-surface-variant":        "#5C5C5C",
        "inverse-surface":           "#2C2C2C",
        "inverse-on-surface":        "#F5F5F5",

        // ── 주요색 (진한 회색) ────────────────────────────
        "primary":                   "#212121",
        "primary-fixed":             "#E0E0E0",
        "primary-fixed-dim":         "#BDBDBD",
        "primary-container":         "#EEEEEE",
        "on-primary":                "#FFFFFF",
        "on-primary-fixed":          "#1A1A1A",
        "on-primary-fixed-variant":  "#424242",
        "on-primary-container":      "#212121",
        "inverse-primary":           "#BDBDBD",

        // ── 보조색 (중간 회색) ────────────────────────────
        "secondary":                 "#616161",
        "secondary-fixed":           "#E0E0E0",
        "secondary-fixed-dim":       "#9E9E9E",
        "secondary-container":       "#F5F5F5",
        "on-secondary":              "#FFFFFF",
        "on-secondary-fixed":        "#1A1A1A",
        "on-secondary-fixed-variant":"#424242",
        "on-secondary-container":    "#424242",

        // ── 세번째 색 (연한 회색) ─────────────────────────
        "tertiary":                  "#9E9E9E",
        "tertiary-fixed":            "#F5F5F5",
        "tertiary-fixed-dim":        "#BDBDBD",
        "tertiary-container":        "#FAFAFA",
        "on-tertiary":               "#1A1A1A",
        "on-tertiary-fixed":         "#1A1A1A",
        "on-tertiary-fixed-variant": "#616161",
        "on-tertiary-container":     "#424242",

        // ── 에러 (진한 회색으로 표현) ─────────────────────
        "error":                     "#424242",
        "error-container":           "#EEEEEE",
        "on-error":                  "#FFFFFF",
        "on-error-container":        "#212121",

        // ── 아웃라인 ──────────────────────────────────────
        "outline":                   "#9E9E9E",
        "outline-variant":           "#D4D4D4",
      },
      borderRadius: {
        "DEFAULT": "0.5rem",
        "lg":      "0.75rem",
        "xl":      "1rem",
        "full":    "9999px"
      },
      spacing: {
        "md":     "24px",
        "sm":     "12px",
        "lg":     "40px",
        "xl":     "64px",
        "xs":     "4px",
        "gutter": "24px",
        "margin": "32px",
        "base":   "8px"
      },
      fontFamily: {
        "display-xl":  ["Inter", "sans-serif"],
        "headline-lg": ["Inter", "sans-serif"],
        "label-caps":  ["Inter", "sans-serif"],
        "body-md":     ["Inter", "sans-serif"],
        "headline-md": ["Inter", "sans-serif"],
        "metric-num":  ["Space Grotesk", "sans-serif"],
        "body-lg":     ["Inter", "sans-serif"]
      },
      fontSize: {
        "display-xl":  ["36px", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-lg": ["26px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
        "label-caps":  ["11px", { lineHeight: "1",   letterSpacing: "0.08em",  fontWeight: "600" }],
        "body-md":     ["13px", { lineHeight: "1.6", fontWeight: "400" }],
        "headline-md": ["20px", { lineHeight: "1.3", fontWeight: "600" }],
        "metric-num":  ["32px", { lineHeight: "1",   letterSpacing: "-0.02em", fontWeight: "700" }],
        "body-lg":     ["15px", { lineHeight: "1.6", fontWeight: "400" }]
      },
      boxShadow: {
        "card":  "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
        "float": "0 4px 20px rgba(0,0,0,0.08)",
      }
    },
  },
  plugins: [],
}

export default config

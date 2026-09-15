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
        // ── Industry 디자인 시스템 (스틸블루 블루프린트) ────
        "ind-bg":        "#e9e9ea",
        "ind-panel":     "#f2f2f3",
        "ind-text":      "#1d1f20",
        "ind-primary":   "#5980a6",
        "ind-primary-dark": "#416180",
        "ind-header":    "#181a1d",
        "ind-header-sub":"#94bce3",
        "ind-border":    "rgba(29,31,32,0.16)",
        "ind-border-lt": "rgba(29,31,32,0.1)",
        // ── 무채색 시스템 ─────────────────────────────────
        "background":                "#F5F5F5",
        // ── Stitch M3 테마 및 공통 토큰 ───────────────────
        "surface":                   "#f8f9ff",
        "on-surface":                "#0b1c30",
        "on-surface-variant":        "#45464d",
        "surface-container-lowest":  "#ffffff",
        "surface-container-low":     "#eff4ff",
        "surface-container":         "#e5eeff",
        "surface-container-high":    "#dce9ff",
        "surface-container-highest": "#d3e4fe",
        "inverse-surface":           "#213145",
        "inverse-on-surface":        "#eaf1ff",
        "primary-container":         "#131b2e",
        "on-primary-container":      "#7c839b",
        "primary-fixed":             "#dae2fd",
        "primary-fixed-dim":         "#bec6e0",
        "secondary-container":       "#fe932c",
        "on-secondary-container":    "#663500",
        "secondary-fixed":           "#ffdcc3",
        "secondary-fixed-dim":       "#ffb77d",
        "on-secondary-fixed-variant":"#6e3900",
        "tertiary":                  "#000000",
        "tertiary-fixed":            "#cce5ff",
        "tertiary-fixed-dim":        "#93ccff",
        "on-tertiary-fixed":         "#001d31",
        "on-tertiary-fixed-variant": "#004b73",
        "on-tertiary-container":     "#188ace",
        "error":                     "#ba1a1a",
        "error-container":           "#ffdad6",
        "on-error":                  "#ffffff",
        "on-error-container":        "#93000a",
        "outline":                   "#76777d",
        "outline-variant":           "#c6c6cd",
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg":      "0.25rem",
        "xl":      "0.5rem",
        "full":    "0.75rem"
      },
      spacing: {
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "space-md": "0.75rem",
        "space-lg": "1.25rem",
        "space-xl": "1.75rem",
        "margin":   "1.5rem",
        "gutter":   "1rem",
        "md":     "24px",
        "sm":     "12px",
        "lg":     "40px",
        "xl":     "64px",
        "xs":     "4px",
        "base":   "8px"
      },
      fontFamily: {
        "display":     ["Hanken Grotesk", "sans-serif"],
        "headline-lg": ["Hanken Grotesk", "sans-serif"],
        "headline-md": ["Hanken Grotesk", "sans-serif"],
        "headline-sm": ["Hanken Grotesk", "sans-serif"],
        "body-lg":     ["Hanken Grotesk", "sans-serif"],
        "body-md":     ["Hanken Grotesk", "sans-serif"],
        "body-sm":     ["Hanken Grotesk", "sans-serif"],
        "label-lg":    ["JetBrains Mono", "monospace"],
        "label-md":    ["JetBrains Mono", "monospace"],
        "label-sm":    ["JetBrains Mono", "monospace"],
        "display-xl":  ["Inter", "sans-serif"],
        "label-caps":  ["Inter", "sans-serif"],
        "metric-num":  ["Space Grotesk", "sans-serif"],
        "body":        ["Barlow", "sans-serif"],
        "cond":        ["Barlow Condensed", "sans-serif"],
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

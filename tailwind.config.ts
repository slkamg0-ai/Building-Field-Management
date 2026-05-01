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
        "secondary-fixed-dim": "#4cd6ff",
        "error": "#ffb4ab",
        "error-container": "#93000a",
        "background": "#111316",
        "tertiary-fixed": "#6bff8f",
        "tertiary-container": "#00b050",
        "surface-bright": "#37393d",
        "on-primary-container": "#572000",
        "secondary-fixed": "#b7eaff",
        "outline-variant": "#5a4136",
        "secondary-container": "#14d1ff",
        "surface-container-highest": "#333538",
        "surface-tint": "#ffb693",
        "surface-variant": "#333538",
        "inverse-on-surface": "#2f3034",
        "on-error": "#690005",
        "on-surface-variant": "#e2bfb0",
        "on-secondary": "#003543",
        "on-tertiary-fixed-variant": "#005321",
        "on-error-container": "#ffdad6",
        "primary-fixed": "#ffdbcc",
        "on-primary": "#561f00",
        "secondary": "#a6e6ff",
        "primary-container": "#ff6b00",
        "on-surface": "#e2e2e6",
        "surface-container-low": "#1a1c1f",
        "on-secondary-container": "#00566b",
        "surface-container": "#1e2023",
        "on-secondary-fixed": "#001f28",
        "on-secondary-fixed-variant": "#004e60",
        "outline": "#a98a7d",
        "primary-fixed-dim": "#ffb693",
        "surface": "#111316",
        "surface-container-lowest": "#0c0e11",
        "on-primary-fixed-variant": "#7a3000",
        "on-background": "#e2e2e6",
        "on-tertiary-container": "#003a15",
        "tertiary-fixed-dim": "#4ae176",
        "on-tertiary-fixed": "#002109",
        "inverse-primary": "#a04100",
        "on-primary-fixed": "#351000",
        "tertiary": "#4ae176",
        "surface-container-high": "#282a2d",
        "on-tertiary": "#003915",
        "surface-dim": "#111316",
        "inverse-surface": "#e2e2e6",
        "primary": "#ffb693"
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      spacing: {
        "md": "24px",
        "sm": "12px",
        "lg": "40px",
        "xl": "64px",
        "xs": "4px",
        "gutter": "24px",
        "margin": "32px",
        "base": "8px"
      },
      fontFamily: {
        "display-xl": ["Space Grotesk"],
        "headline-lg": ["Space Grotesk"],
        "label-caps": ["Space Grotesk"],
        "body-md": ["Inter"],
        "headline-md": ["Space Grotesk"],
        "metric-num": ["Space Grotesk"],
        "body-lg": ["Inter"]
      },
      fontSize: {
        "display-xl": ["48px", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-lg": ["32px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
        "label-caps": ["12px", { lineHeight: "1", letterSpacing: "0.1em", fontWeight: "700" }],
        "body-md": ["16px", { lineHeight: "1.5", fontWeight: "400" }],
        "headline-md": ["24px", { lineHeight: "1.3", fontWeight: "600" }],
        "metric-num": ["40px", { lineHeight: "1", letterSpacing: "-0.02em", fontWeight: "700" }],
        "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }]
      }
    },
  },
  plugins: [],
}
export default config

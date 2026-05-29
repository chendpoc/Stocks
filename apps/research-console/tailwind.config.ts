import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1600px",
      },
    },
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "rgb(var(--twc-background) / <alpha-value>)",
        foreground: "rgb(var(--twc-foreground) / <alpha-value>)",
        card: {
          DEFAULT: "rgb(var(--twc-card) / <alpha-value>)",
          foreground: "rgb(var(--twc-card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "rgb(var(--twc-popover) / <alpha-value>)",
          foreground: "rgb(var(--twc-popover-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgb(var(--twc-primary) / <alpha-value>)",
          foreground: "rgb(var(--twc-primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--twc-secondary) / <alpha-value>)",
          foreground: "rgb(var(--twc-secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--twc-muted) / <alpha-value>)",
          foreground: "rgb(var(--twc-muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--twc-accent) / <alpha-value>)",
          foreground: "rgb(var(--twc-accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--twc-destructive) / <alpha-value>)",
          foreground: "rgb(var(--twc-destructive-foreground) / <alpha-value>)",
        },
        border: "rgb(var(--twc-border) / <alpha-value>)",
        input: "rgb(var(--twc-input) / <alpha-value>)",
        ring: "rgb(var(--twc-ring) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          "IBM Plex Sans",
          "Microsoft YaHei",
          "PingFang SC",
          "Segoe UI",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "SFMono-Regular", "Consolas", "Liberation Mono", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;

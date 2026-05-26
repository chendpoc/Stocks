import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
  plugins: [],
};

export default config;

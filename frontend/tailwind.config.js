/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        // Warm, paper-like neutrals (light) and soft charcoal (dark).
        paper: {
          DEFAULT: "#faf7f1",
          card: "#ffffff",
          muted: "#f3efe6",
        },
        ink: {
          DEFAULT: "#2b2822",
          muted: "#6f6a60",
        },
        night: {
          DEFAULT: "#1b1a17",
          card: "#26241f",
          muted: "#302d27",
        },
        // Claude-like warm coral/terracotta accent (the "dual tone" partner to
        // the paper neutrals).
        clay: {
          50: "#fbf0ea",
          100: "#f6dccf",
          200: "#eab9a0",
          300: "#de9670",
          400: "#d3774e",
          500: "#c15f3c",
          600: "#a44e30",
          700: "#843f28",
          800: "#6b3524",
          900: "#582d20",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(43,40,34,0.04), 0 8px 24px rgba(43,40,34,0.06)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

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
        clay: {
          50: "#f7f2ec",
          100: "#ecdfcf",
          200: "#dcc3a6",
          300: "#c99f74",
          400: "#bd8455",
          500: "#a96f42",
          600: "#8f5a36",
          700: "#73472e",
          800: "#5d3b29",
          900: "#4d3224",
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

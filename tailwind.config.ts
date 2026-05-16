import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        norway: {
          red: "#BA0C2F",
          white: "#FFFFFF",
          blue: "#00205B",
        },
      },
      fontFamily: {
        display: ["Playfair Display", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      keyframes: {
        wave: {
          "0%, 100%": { transform: "rotate(-2deg)" },
          "50%": { transform: "rotate(2deg)" },
        },
        pop: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.95" },
        },
        glow: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(186, 12, 47, 0.5)" },
          "50%": { boxShadow: "0 0 30px rgba(186, 12, 47, 0.8)" },
        },
      },
      animation: {
        wave: "wave 4s ease-in-out infinite",
        pop: "pop 0.2s ease-out",
        "pulse-subtle": "pulse-subtle 3s ease-in-out infinite",
        glow: "glow 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;

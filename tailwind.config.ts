import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f4f9ff",
          100: "#e8f2ff",
          500: "#1876f2",
          600: "#0f5fcb",
          900: "#0f254a"
        }
      },
      boxShadow: {
        card: "0 6px 18px rgba(15, 37, 74, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

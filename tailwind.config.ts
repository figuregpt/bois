import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        page: "#dadada",
        dark: "#0a0a0a",
        red: {
          DEFAULT: "#13182B",
          dark: "#0d1120",
        },
        accent: {
          DEFAULT: "#13182B",
          light: "#1e2540",
        },
        light: "#f9f9f8",
      },
      fontFamily: {
        sans: ["Satoshi", "sans-serif"],
        serif: ["Yuji Syuku", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;

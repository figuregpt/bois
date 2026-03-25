import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        page: "#EDE3BC",
        dark: "#2F2B28",
        brand: {
          DEFAULT: "#A64C4F",
          dark: "#8a3d40",
        },
        accent: {
          DEFAULT: "#A64C4F",
        },
        navy: "#3B3E74",
        gold: "#DEA831",
        taupe: "#826D62",
        sage: "#AFC283",
        light: "#EDE3BC",
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

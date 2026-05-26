module.exports = {
  content: ["./app/**/*.{ts,tsx,jsx,js}", "./dev-logs/*.md"],
  theme: {
    extend: {
      colors: {
        // https://coolors.co/f1eee4-1c0f13-f7a1c4-f5d491-1985a1
        primary: {
          400: "#f9bdd5",
          500: "#F7A1C4",
        },
        secondary: {
          500: "#F5D491",
        },
        dark: {
          500: "#1C0F13",
        },
        light: {
          500: "#F1EEE4",
          600: "#D8D6Cd",
          700: "#C0BEB6",
        },
      },
    },
  },
  plugins: [],
};

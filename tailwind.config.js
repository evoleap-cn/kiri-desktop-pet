/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/acp/index.html",
    "./src/acp/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {},
  },
  plugins: [],
};

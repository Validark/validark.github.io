/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme')
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue,mjs}'],
  darkMode: 'class', // allows toggling dark mode manually
  theme: {
    extend: {
      fontFamily: {
        sans: ['Roboto', 'sans-serif', ...defaultTheme.fontFamily.sans],
      },
      screens: {
        xxxs: '10px',
        xxs: '300px',
        xs: '345px',
        md: '640px',
        lg: '1360px',
        xl: '1760px',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

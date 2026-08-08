import rootConfig from '../../tailwind.config.js';

/** @type {import('tailwindcss').Config} */
export default {
  ...rootConfig,
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/react/src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
};

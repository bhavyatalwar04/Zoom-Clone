const config = {
  plugins: [
    "@tailwindcss/postcss",
    // Tailwind v4 targets Chrome 111 / Safari 16.4; these keep the UI intact on older mobile browsers.
    "./postcss-legacy-fallbacks.cjs",
    "@csstools/postcss-cascade-layers",
  ],
};

export default config;

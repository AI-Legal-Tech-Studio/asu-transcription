import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      ".next/**",
      "app/.well-known/workflow/v1/**/*.js",
      "node_modules/**",
      "test-results/**",
    ],
  },
  ...nextVitals,
];

export default config;

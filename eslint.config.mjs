import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [".next/**", "node_modules/**", "test-results/**"],
  },
  ...nextVitals,
];

export default config;

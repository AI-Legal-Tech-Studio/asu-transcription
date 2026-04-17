import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/summarize": [
      "./.next/node_modules/**/*",
      "./node_modules/.prisma/**/*",
      "./node_modules/@prisma/**/*",
      "./node_modules/pg/**/*",
      "./node_modules/@swc/helpers/package.json",
      "./node_modules/@swc/helpers/cjs/**/*",
      "./node_modules/next/dist/compiled/source-map/**/*",
      "./node_modules/next/dist/compiled/stacktrace-parser/**/*",
    ],
  },
};

export default withWorkflow(nextConfig);

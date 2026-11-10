import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // @course/shared is consumed as TypeScript source (no build step).
  transpilePackages: ["@course/shared"],
  // Lesson files are read from disk at runtime (not imported), so tell the tracer to ship them.
  outputFileTracingIncludes: {
    "/muestra": ["./src/content-fixtures/**/*"],
    "/lecciones/[slug]": ["../../content/**/*"],
  },
};

export default nextConfig;

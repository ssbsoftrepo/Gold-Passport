import type { NextConfig } from "next";

/**
 * The web app is a client-rendered back office: every page fetches from the Spring Boot API
 * with the user's bearer token, so the classic (non cache-components) rendering model is used.
 * `output: "standalone"` produces a small Node server for the Docker image.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict mode mounts every effect twice in development. The meeting room owns real resources
  // (camera, microphone, WebSocket, peer connections) that must be created exactly once.
  reactStrictMode: false,
};

export default nextConfig;

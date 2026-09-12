import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOME_IMAGE_MAX_BYTES,
  HOME_IMAGE_QUALITY,
  HOME_IMAGE_REMOTE_HOST
} from "./src/features/home/homeImage";

const appRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: appRoot
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: HOME_IMAGE_REMOTE_HOST,
        port: "",
        pathname: "/**"
      }
    ],
    qualities: [HOME_IMAGE_QUALITY, 75],
    minimumCacheTTL: 86_400,
    maximumRedirects: 0,
    maximumResponseBody: HOME_IMAGE_MAX_BYTES,
    dangerouslyAllowLocalIP: false,
    dangerouslyAllowSVG: false
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8"
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate"
          },
          {
            key: "Service-Worker-Allowed",
            value: "/"
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          }
        ]
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json; charset=utf-8"
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          }
        ]
      },
      {
        source: "/offline.html",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          }
        ]
      }
    ];
  }
};

export default nextConfig;

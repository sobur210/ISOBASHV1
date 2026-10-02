const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
const configuredWebUrl = process.env.NEXT_PUBLIC_WEB_URL?.trim().replace(/\/+$/, "");

if (process.env.NODE_ENV === "production" && !configuredApiUrl) {
  throw new Error("NEXT_PUBLIC_API_URL must be set for production builds.");
}

if (process.env.NODE_ENV === "production" && !configuredWebUrl) {
  throw new Error("NEXT_PUBLIC_WEB_URL must be set for production builds.");
}

export const API_URL = configuredApiUrl ?? "http://localhost:3001";
export const WEB_URL = configuredWebUrl ?? "http://localhost:3002";

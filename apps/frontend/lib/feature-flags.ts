/**
 * Phase 1 feature flags, mirroring the backend's `shared/config/feature-flags.ts`.
 *
 * The browser copy exists so a hidden surface is actually hidden. It is never
 * the enforcement point: `FeatureGuard` on the server is what refuses a route,
 * so flipping a flag in the UI cannot grant access. Each `process.env` read is
 * written out longhand because Next.js only inlines statically analysable
 * `NEXT_PUBLIC_*` lookups at build time.
 */

export type FeatureName = "projects" | "files" | "codeWorkspace";

export type FeatureFlags = Record<FeatureName, boolean>;

function readFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  if (value !== "true" && value !== "false") {
    throw new Error(`A NEXT_PUBLIC_FEATURE_* flag must be "true" or "false", got "${value}".`);
  }
  return value === "true";
}

const inDevelopment = process.env.NODE_ENV !== "production";

export const featureFlags: FeatureFlags = {
  projects: readFlag(process.env.NEXT_PUBLIC_FEATURE_PROJECTS, false),
  files: readFlag(process.env.NEXT_PUBLIC_FEATURE_FILES, false),
  codeWorkspace: readFlag(process.env.NEXT_PUBLIC_FEATURE_CODE_WORKSPACE, inDevelopment),
};

/**
 * Whether a retired surface should still be reachable.
 *
 * Off by default, and visible to nobody else. The admin sees Projects and Files
 * regardless of the flag, because a flag hides a surface from the people using
 * the product and must not lock out the person who has to inspect the code that
 * is still running. The server applies the same rule in `FeatureGuard`, so this
 * is a convenience, not the control.
 */
export function featureVisible(feature: FeatureName, role: "ADMIN" | "USER" | undefined): boolean {
  if (role === "ADMIN") return true;
  return featureFlags[feature];
}
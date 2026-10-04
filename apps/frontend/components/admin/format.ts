/**
 * Display formatters for the admin console.
 *
 * Kept in one place so a byte count, a duration or a boolean reads identically in
 * every panel. Each one is total: it never throws on a value the API did not
 * promise, because a formatter that crashes takes the whole console down with it.
 */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: unknown): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : Number(value.toFixed(1))} ${BYTE_UNITS[unit]}`;
}

export function formatDuration(seconds: unknown): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const secs = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

/** `1000000` → `1,000,000`. Numbers are the common case in a config view. */
export function formatNumber(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return formatScalar(value);
}

/** Byte-shaped keys get a human size; everything else gets its plain value. */
export function formatLimitValue(key: string, value: unknown): string {
  if (/bytes$/i.test(key)) return formatBytes(value);
  if (typeof value === "boolean") return value ? "enforced" : "not configured";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  return formatScalar(value);
}

export function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.length ? value : "—";
  return JSON.stringify(value);
}

/** `2026-10-03T09:41:00.000Z` → a readable local stamp, without seconds noise. */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatClock(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** `dataRoot` → `Data root`. Storage roots are camelCase in the API, prose here. */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
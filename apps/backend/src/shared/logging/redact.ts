/**
 * Redaction for anything that can reach a log line.
 *
 * The rule this file exists to enforce: a log line may say *that* a credential
 * was used, never *what* it was. Nothing in this codebase should have to know
 * which headers or parameters are sensitive, because the next endpoint added
 * would get it wrong. Every value that looks like a credential is replaced with
 * a fixed marker before it is serialised, and the shape of the secret (its
 * length, or a scheme prefix) is deliberately not preserved either.
 *
 * Applied to the request log (`request-logging.middleware.ts`), which is the one
 * place where caller-controlled text lands in a log verbatim.
 */

/** Replaces a matched secret. No length, no prefix: both narrow a brute force. */
export const REDACTED = '[redacted]';

/**
 * Query-string parameters that carry a bearer credential. Matched by name, so a
 * secret that arrives in `?token=` is removed even though no pattern recognises
 * its shape.
 */
const SENSITIVE_PARAM_NAMES = [
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'api_key',
  'apikey',
  'key',
  'secret',
  'password',
  'passwd',
  'pwd',
  'session',
  'session_id',
  'sid',
  'auth',
  'authorization',
  'cookie',
  'code',
  'sig',
  'signature',
];

/**
 * Value shapes that are a credential wherever they appear. Deliberately narrow:
 * each one is a real key format used by a provider this app talks to, so the
 * false-positive rate stays low enough that redacting is not a reflex.
 */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bsk-or-v1-[A-Za-z0-9_-]+/g, // OpenRouter
  /\bsk-[A-Za-z0-9_-]{16,}/g, // OpenAI-style
  /\bAIza[0-9A-Za-z_-]{20,}/g, // Google
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g, // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{16,}/g, // GitHub fine-grained
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bmhk_[A-Za-z0-9]{10,}/g, // Magic Hour
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

/**
 * A URL with inline credentials (`postgres://user:pass@host`) keeps the scheme
 * and host, because those are the useful parts of a connection error, and drops
 * the pair.
 */
function redactUrlCredentials(value: string): string {
  return value.replace(
    /\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi,
    (_match, scheme: string, user: string) => `${scheme}${user}:${REDACTED}@`,
  );
}

/** The userinfo of a `user:pass@host` authority, for `redis://` and friends. */
function redactUrlUserinfoOnlyPassword(value: string): string {
  return value.replace(
    /\b([a-z][a-z0-9+.-]*:\/\/[^/\s:@]+):([^/\s@]+)@/gi,
    (_match, prefix: string) => `${prefix}:${REDACTED}@`,
  );
}

function isSensitiveParam(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_PARAM_NAMES.some((sensitive) => lower === sensitive || lower.endsWith(`_${sensitive}`));
}

/**
 * A query string with every sensitive parameter's value replaced.
 *
 * Operates on the raw string rather than through `URLSearchParams` so the result
 * is a drop-in for a log field: re-encoding through `URLSearchParams` would
 * alter unrelated parameters and make a logged URL stop matching the request.
 */
export function redactQueryString(query: string): string {
  if (!query) return query;
  return query
    .split('&')
    .map((pair) => {
      const separator = pair.indexOf('=');
      if (separator === -1) return pair;
      const name = pair.slice(0, separator);
      return isSensitiveParam(decodeSafely(name)) ? `${name}=${REDACTED}` : pair;
    })
    .join('&');
}

function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/**
 * A request URL safe to log: sensitive query parameters and inline credentials
 * removed, path preserved.
 *
 * The path is *not* redacted. A session id in a path segment is a design
 * mistake that should be visible in a log rather than hidden from one.
 */
export function redactUrl(url: string): string {
  if (!url) return url;
  const separator = url.indexOf('?');
  if (separator === -1) return redactUrlCredentials(url);
  const base = url.slice(0, separator);
  const query = url.slice(separator + 1);
  return `${base}?${redactQueryString(query)}`;
}

/**
 * Any string on its way into a log line. Applied last, and belt-and-braces: it
 * catches a provider key echoed inside an error message by a third-party
 * library, which is the common way a secret escapes without anyone logging it
 * deliberately.
 */
export function redactText(value: string): string {
  let output = redactUrlUserinfoOnlyPassword(redactUrlCredentials(value));
  for (const pattern of SECRET_VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    output = output.replace(pattern, REDACTED);
  }
  return output;
}

/**
 * Headers safe to log. Only an allow-list of diagnostic headers is kept, so a
 * caller cannot get `Authorization` or `Cookie` into a log line by adding a
 * header this function has never heard of.
 */
export function redactHeaders(headers: Record<string, unknown>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const name of ['user-agent', 'referer', 'content-type', 'content-length', 'accept-language']) {
    const value = headers[name];
    if (typeof value === 'string') safe[name] = redactText(value);
  }
  return safe;
}
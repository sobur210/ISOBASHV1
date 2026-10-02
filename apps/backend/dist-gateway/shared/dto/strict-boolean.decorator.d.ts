/**
 * Accepts a boolean only if the caller actually sent one.
 *
 * The global pipe runs with `transform: true` and `enableImplicitConversion: true`
 * so that query strings and form posts can carry numbers. The side effect is that
 * implicit conversion coerces *any* value to the declared type before
 * `@IsBoolean()` runs, which turns this table into a lie:
 *
 *   `"false"` -> true      `"no"` -> true      `1` -> true      `{}` -> true
 *
 * A client that sends the string `"false"` would silently get the opposite
 * setting, and a client that sends nonsense would be accepted as `true`. That is
 * worse than refusing the request, so the pipe's coercion is not trustworthy for
 * booleans and `@IsBoolean()` alone cannot catch it.
 *
 * The fix is `@StrictBoolean()`: it maps the two strings a form or query string
 * can legitimately produce (`"true"` / `"false"`, trimmed and case-insensitive)
 * onto real booleans, passes real booleans through untouched, and returns anything
 * else unchanged so `@IsBoolean()` rejects it. Note the decorator only works
 * because the field is declared as `boolean | string`: the union makes
 * `design:type` reflect as `Object`, which is not a type implicit conversion
 * knows how to coerce, so the raw value survives until `@Transform` runs.
 *
 * Declare every boolean validated field as `boolean | string`.
 */
export declare function StrictBoolean(): PropertyDecorator;
/**
 * The same mapping, exposed for services that take a validated DTO: a
 * `boolean | string` field is typed that way only so the pipe cannot coerce it
 * before validation sees it, so narrowing it back to a real boolean at the
 * service boundary needs this rather than a cast.
 *
 * Returns `undefined` for anything that is not a boolean or the strings
 * `"true"` / `"false"`, so a service can never be handed a truthy string and
 * read it as `true`.
 */
export declare function strictBooleanValue(value: unknown): boolean | undefined;

import type { en } from "./en";
import type { PluralMessage } from "./types";

/**
 * Catalog typing, derived from the English source (`en.ts`).
 *
 * `Catalog` is what every other language must satisfy: the same keys, and the
 * same shape per key (plain string vs plural). Placeholder names are read from
 * the English literal types, so `t()` knows which params each key needs.
 */

type English = typeof en;

export type MessageKey = keyof English;

export type Catalog = {
  readonly [K in MessageKey]: English[K] extends string ? string : PluralMessage;
};

/** `"Score {score} of {total}"` → `"score" | "total"`. */
type PlaceholdersOf<S> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | PlaceholdersOf<Rest>
  : never;

type ParamNames<M> = M extends string
  ? PlaceholdersOf<M>
  : M extends PluralMessage
    ? PlaceholdersOf<M["one"]> | PlaceholdersOf<M["other"]> | "count"
    : never;

export type ParamValue = string | number;

/** Params for `key`: none, or exactly the placeholders it uses (plurals need `count`). */
export type MessageParams<K extends MessageKey> = English[K] extends PluralMessage
  ? { readonly count: number } & { readonly [P in Exclude<ParamNames<English[K]>, "count">]: ParamValue }
  : { readonly [P in ParamNames<English[K]>]: ParamValue };

/** Rest args of `t()`: keys without placeholders take no params object. */
export type MessageArgs<K extends MessageKey> = [ParamNames<English[K]>] extends [never]
  ? []
  : [params: MessageParams<K>];

/** Keys whose English message has no placeholder (safe for `t(key)`). */
export type PlainMessageKey = {
  [K in MessageKey]: MessageArgs<K> extends [] ? K : never;
}[MessageKey];

import { Fragment, type ReactNode } from "react";
import type { ParamValue } from "./catalog";

const SLOT = /\{(\w+)\}/g;

/**
 * A translated template with React nodes in some placeholders, e.g.
 * "BEST {best} · {tries}" with `best` in a <strong>. The word order stays the
 * catalog's (French may move the slot), and no HTML string is ever parsed.
 * Placeholders without a slot are left as text, like `t()` does.
 */
export function Rich({
  template,
  slots,
}: {
  template: string;
  slots: Readonly<Record<string, ReactNode | ParamValue>>;
}) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of template.matchAll(SLOT)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(template.slice(cursor, index));
    const name = match[1];
    parts.push(name in slots ? slots[name] : match[0]);
    cursor = index + match[0].length;
  }
  if (cursor < template.length) parts.push(template.slice(cursor));
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>{part}</Fragment>
      ))}
    </>
  );
}

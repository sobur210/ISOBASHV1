<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Hard rules for agents working in this app

## Never edit `app/globals.css` without being asked

`app/globals.css` is the single design-token source of truth. One palette drives the
marketing site, the workspace and the admin console, and `.light` is its tuned
counterpart. No component is allowed to reach for a raw hex, which is only true if
this file is the only place hexes live.

Do not edit it to make a page look right. Do not add or "tidy" utilities, reorder
rules, reformat comments, swap em-dashes, or reflow whitespace in it. Do not
convert its tokens to Tailwind config. If a task appears to need a change here,
stop and ask the owner first — the answer is often a variant class, a local
`style` prop, or a new component, none of which touch the shared source.

This applies to every agent and every session, including parallel ones. Unrelated
comment-only churn in this file has already caused a false alarm once; leave the
file byte-for-byte alone unless a change to it is the literal task.

If you need a one-off visual treatment, put it on the element as a Tailwind
arbitrary value or an inline style. That is always the right answer.

## Related

- `app/layout.tsx` and `lib/auth-server.ts` have the same rule: do not restructure
  them for a feature task.
- Never delete existing code to make a build pass. Fix the cause, or report it.

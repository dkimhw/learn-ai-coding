## Coding standards

This repo's coding standards live in the **`coding-standards`** skill
(`.claude/skills/coding-standards/`), split by area so only the relevant part
gets loaded:

- `references/typescript.md` — object params, `~/*` import alias, no `any`
- `references/database.md` — Drizzle/SQLite: ids, timestamps, booleans, money, soft deletes
- `references/routes.md` — React Router v7 routes, validation, `intent` unions, auth
- `references/services.md` — where logic lives, `{ ok }` result pattern, test requirement
- `references/testing.md` — vitest globals and the required db mock
- `references/ui.md` — component placement, `cn()`, `formatPrice()`

The skill is model-invoked only (`user-invocable: false`) — there's no
`/coding-standards` command. Claude loads it automatically when writing or
reviewing code; humans can read the files directly.

## Stack

React Router v7 (file-based routing) · SQLite via better-sqlite3 + Drizzle ·
Zod validation · vitest · Tailwind + shadcn.

# Server-only imports in route components

> Symptom: typing a URL works, clicking a link to the same page does nothing.
> Cause: a service that imports `~/db` ended up in the browser bundle.
> Fix: keep values that route *components* read out of service modules.

## What broke

The instructor analytics pages (`/instructor/analytics` and
`/instructor/:courseId/analytics`) were reachable by typing or pasting their URL,
but no in-app link or button would get you there. The sidebar Analytics item, the
course-card drop-off claim, the scope picker — all inert. No visible error; the
page simply stayed where it was.

The browser console had the whole story:

```
Error loading route module `/app/routes/instructor.analytics.tsx`, reloading page...
TypeError: promisify is not a function
    at node_modules/better-sqlite3/lib/methods/backup.js
    at node_modules/better-sqlite3/lib/database.js
```

`better-sqlite3` — a native Node module — was being loaded **in the browser**.

## Why it happened

Both routes did this:

```ts
import {
  getLessonDropOff,        // used in the loader
  VERDICT_MIN_STUDENTS,    // used in the component
} from "~/services/analyticsService";
```

React Router's Vite plugin removes `loader` and `action` from the client build,
then relies on dead-code elimination to drop whatever only they used. That works
for `getLessonDropOff`. It cannot work for `VERDICT_MIN_STUDENTS`, because the
*component* renders it — "We wait for 20 students before calling a lesson a
problem". One surviving value import is enough to keep the entire module in the
client graph:

```
instructor.analytics.tsx  →  analyticsService  →  ~/db  →  better-sqlite3
```

In the browser, `better-sqlite3` throws while initialising. React Router catches
that as a failed route-module load, so the client-side transition never
completes and the click appears to do nothing.

Typing the URL worked because that render happens on the server, where
`better-sqlite3` is real. **That asymmetry is the signature of this bug**: SSR
fine, client navigation dead.

## The fix

Constants the UI has to say out loud now live in a module with no database
import, `app/lib/analytics.ts`:

```ts
export const MATURITY_WINDOW_DAYS = 30;
export const VERDICT_MIN_STUDENTS = 20;
```

- `analyticsService` imports them from there and re-exports them, so server
  callers still have one import and there is still one definition.
- Route components import them from `~/lib/analytics` directly.

## The rule

**A route component may not import a *value* from a module that touches the
database.** Loaders and actions may, freely — they are stripped from the client
build.

- **Types are always safe.** `import type { LessonDropOff } from "~/services/analyticsService"`
  is erased at compile time and pulls in nothing. Every analytics component does
  this and none of them were affected.
- **`import type` matters.** A type imported without the `type` keyword is a real
  import and will drag the module in.
- **Constants, enums, and pure helpers** that both the service and the UI need
  belong in `app/lib/`, not in the service.

## How to spot it

The console error names the route module and the native dependency, so grep the
route's value imports for anything reaching `~/db`:

```sh
grep -rn "services/" app/routes/<route>.tsx | grep -v "import type"
```

Then check whether each imported binding is used outside the loader/action. If it
is used in the component, it does not belong in a service.

## Related

- Feature this surfaced in: `plans/instructor-course-analytics.md` (phase 11,
  though `instructor/:courseId/analytics` carried the same defect from phase 6).
- Note that browser extensions (Dark Reader, ad blockers) inject attributes and
  style tags that produce hydration-mismatch warnings in dev. Those are noise —
  they are not this bug, and they do not break navigation.

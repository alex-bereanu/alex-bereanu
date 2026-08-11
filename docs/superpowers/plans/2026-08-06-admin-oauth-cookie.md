# Admin OAuth Cookie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a successful Google OAuth callback land directly on the Admin dashboard.

**Architecture:** Extend the existing secure-cookie helper with an optional SameSite argument whose default remains `strict`. Pass `lax` only from the Google OAuth callback.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript, Node test runner through the installed `tsx` runtime.

## Global Constraints

- Preserve `httpOnly`, production-only `secure`, root path, high priority, and expiration behavior.
- Preserve `SameSite=Strict` for every non-OAuth caller.
- Add no dependency.

---

### Task 1: Scope the Admin OAuth cookie policy

**Files:**
- Create: `src/server/auth/cookies.test.ts`
- Modify: `src/server/auth/cookies.ts`
- Modify: `src/app/api/admin/oauth/google/callback/route.ts`

**Interfaces:**
- Consumes: `getSecureCookieOptions(maxAge)` from the existing authentication routes.
- Produces: `getSecureCookieOptions(maxAge, sameSite?)`, defaulting to `strict`.

- [ ] **Step 1: Write the failing test**

```ts
test("keeps strict cookies by default and allows the OAuth return to use lax", () => {
  assert.equal(getSecureCookieOptions(60).sameSite, "strict");
  assert.equal(getSecureCookieOptions(60, "lax").sameSite, "lax");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test src/server/auth/cookies.test.ts`

Expected: FAIL because the current helper ignores the requested `lax` policy.

- [ ] **Step 3: Implement the minimum change**

Add an optional `sameSite: "strict" | "lax" = "strict"` parameter and pass `"lax"` only when the OAuth callback sets the Admin session cookie.

- [ ] **Step 4: Verify**

Run the focused test, lint, typecheck, and the Admin Phase 0 verifier. Repeat the browser OAuth flow and confirm it lands directly on `/admin`.

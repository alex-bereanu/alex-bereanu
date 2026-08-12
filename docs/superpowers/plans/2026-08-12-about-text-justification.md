# About Text Justification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Justify the homepage About Me body copy at every viewport width while leaving its heading and all other text unchanged.

**Architecture:** Apply Tailwind's native `text-justify` utility directly to the existing About Me paragraph. This keeps the behavior local to the component and needs no custom CSS, breakpoint overrides, or dependencies.

**Tech Stack:** Next.js 16.2 App Router, React 19, Tailwind CSS 4, TypeScript

## Global Constraints

- Apply justification on both mobile and desktop.
- Keep the About Me heading left-aligned.
- Preserve the existing content, whitespace handling, typography, color, layout, and responsive breakpoints.
- Do not change the Contact section, admin preview, or other body copy.

---

### Task 1: Justify the About Me Body Copy

**Files:**
- Modify: `src/app/page.tsx:49`
- Test: existing project lint, TypeScript, and production build checks

**Interfaces:**
- Consumes: the existing `aboutContent.body` string and Tailwind CSS utility processing.
- Produces: an About Me `<p>` whose computed `text-align` is `justify` at every viewport width.

- [ ] **Step 1: Verify the justification class is absent**

Run:

```powershell
rg -n 'whitespace-pre-wrap text-justify text-sm text-neutral-700' src/app/page.tsx
```

Expected: no match and a non-zero exit code.

- [ ] **Step 2: Apply the minimal implementation**

Change the existing About Me paragraph to:

```tsx
<p className="whitespace-pre-wrap text-justify text-sm text-neutral-700">
  {aboutContent.body}
</p>
```

- [ ] **Step 3: Verify the class is present only on the About Me body**

Run:

```powershell
rg -n 'text-justify' src/app/page.tsx
```

Expected: exactly one match on the About Me paragraph; the heading and Contact paragraph do not include `text-justify`.

- [ ] **Step 4: Run static verification**

Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

Expected: all three commands exit successfully.

- [ ] **Step 5: Inspect representative responsive viewports**

Run the app and inspect the homepage at a narrow mobile viewport and a desktop viewport. At both widths, confirm the About Me body is justified, the heading remains left-aligned, and the responsive layout is unchanged.

- [ ] **Step 6: Commit the implementation**

```powershell
git add src/app/page.tsx
git commit -m "fix: justify about text across viewports"
```

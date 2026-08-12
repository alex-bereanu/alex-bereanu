# Contact Turnstile Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the contact form's Cloudflare Turnstile widget unless interaction is required, then display its compact form centered in the contact form.

**Architecture:** Extend the existing client-side `TurnstileField` wrapper with typed `appearance` and `size` options that map directly to Cloudflare's explicit-render API. Opt only the contact form into `interaction-only` and `compact`, preserving explicit current defaults for every other consumer.

**Tech Stack:** Next.js 16 App Router, React 19 client components, TypeScript, Tailwind CSS 4, Cloudflare Turnstile explicit rendering.

## Global Constraints

- Keep server-side Siteverify validation and all token lifecycle behavior unchanged.
- Change only the contact form presentation; booking, gallery, setup, and login forms retain their current rendering behavior.
- Add no dependencies and no global CSS.
- Push only after typecheck, lint, build, and mobile visual verification succeed.

---

### Task 1: Configure the Contact Turnstile Presentation

**Files:**
- Modify: `src/components/contact-form.tsx:173`
- Modify: `src/components/turnstile-field.tsx:7-18,27-31,58,99-105`

**Interfaces:**
- Consumes: Cloudflare explicit-render options `appearance: "always" | "execute" | "interaction-only"` and `size: "normal" | "flexible" | "compact"`.
- Produces: `TurnstileFieldProps` with optional `appearance` and `size` props; omitted values resolve to `"always"` and `"normal"`.

- [ ] **Step 1: Wire the desired contact-form props first**

Replace the contact form call with:

```tsx
<TurnstileField
  action="contact"
  appearance="interaction-only"
  className="flex justify-center sm:col-span-2"
  siteKey={turnstileSiteKey}
  size="compact"
/>
```

- [ ] **Step 2: Run the compiler to verify the new contract is initially rejected**

Run: `npm run typecheck`

Expected: FAIL because `appearance` is not yet a property of `TurnstileFieldProps`.

- [ ] **Step 3: Add the minimal typed Cloudflare options**

Add the two option types, include the options in the render API contract and component props, default existing consumers to their current behavior, and pass the values to `turnstile.render`:

```tsx
type TurnstileAppearance = "always" | "execute" | "interaction-only";
type TurnstileSize = "normal" | "flexible" | "compact";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: TurnstileAction;
      appearance: TurnstileAppearance;
      size: TurnstileSize;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

type TurnstileFieldProps = {
  siteKey?: string;
  action: TurnstileAction;
  appearance?: TurnstileAppearance;
  size?: TurnstileSize;
  className?: string;
};

export function TurnstileField({
  siteKey,
  action,
  appearance = "always",
  size = "normal",
  className,
}: TurnstileFieldProps) {
  // Existing implementation remains unchanged.
}
```

Include `appearance` and `size` in the object passed to `turnstile.render`, and add both to the render effect dependency list.

- [ ] **Step 4: Run static and production checks**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Verify the mobile presentation**

Run the local application and inspect the homepage contact form at a mobile viewport. Confirm the standard 300-by-65 widget no longer appears during normal verification, the Turnstile host row occupies the full contact-form grid, and its flex alignment centers an interactive compact widget. Confirm the submit flow and status placement remain unchanged.

- [ ] **Step 6: Review and commit the implementation**

Run: `git diff --check`

Expected: no output.

Review the diff to confirm no unrelated files changed, then commit:

```bash
git add src/components/contact-form.tsx src/components/turnstile-field.tsx
git commit -m "fix: refine contact Turnstile presentation"
```

- [ ] **Step 7: Push the verified production branch**

Run: `git push origin main`

Expected: the local `main` branch, including the design, plan, and implementation commits, is pushed to `origin/main` and triggers the configured production deployment.

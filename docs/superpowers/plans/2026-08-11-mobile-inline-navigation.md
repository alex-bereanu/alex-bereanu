# Mobile Inline Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the public navigation visible beneath "Alex Bereanu" at every viewport, with all mobile links fitting on one centered row and the active underline close to its label.

**Architecture:** Simplify `SiteHeader` to one stateless navigation tree shared by desktop and mobile. Remove the drawer-only client behavior and CSS, then use the existing mobile media query to preserve the vertical header layout, scale the mobile link typography and spacing, and position the underline relative to the visible label while retaining coarse-pointer touch targets.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS, Node.js verification scripts

## Global Constraints

- Desktop must preserve the current centered brand and single-row centered navigation.
- Mobile navigation must appear immediately beneath the centered brand.
- Mobile navigation must keep all seven links in one centered row at widths down to 320px, without clipping or horizontal scrolling.
- Mobile links must retain the existing 44px minimum coarse-pointer touch target.
- The active/focus underline must sit approximately 1-2px below the visible label instead of at the bottom of the touch target.
- Navigation destinations, page content, footer behavior, and admin navigation must remain unchanged.
- Do not add dependencies.

---

### Task 1: Replace the mobile drawer with one responsive navigation

**Files:**
- Modify: `scripts/verify-phase4-mobile-resume.mjs`
- Modify: `src/components/site-header.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `SiteHeaderProps.links: readonly SiteHeaderLink[]`, `SiteHeaderProps.brandName?: string`, and the existing `.site-header`, `.site-header-inner`, `.header-brand`, `.header-nav`, and `.header-link` style hooks.
- Produces: `SiteHeader(props): JSX.Element` with one `<nav aria-label="Primary navigation" className="header-nav">` and no client-side menu state.

- [ ] **Step 1: Change the source-level verification to describe the new behavior**

Replace the mobile drawer assertion in `scripts/verify-phase4-mobile-resume.mjs` with:

```js
includesAll(siteHeader, ['aria-label="Primary navigation"', 'className="header-nav"'], "inline mobile navigation");
excludesAll(siteHeader, ['"use client"', "react-dom", "useState", "mobile-menu"], "inline mobile navigation");
includesAll(styles, ["overflow-x: clip", "env(safe-area-inset-top)", "@media (pointer: coarse)", "prefers-reduced-motion", "min-height: 2.75rem", "flex-wrap: wrap"], "mobile CSS");
excludesAll(styles, [".mobile-menu-", ".header-nav-desktop"], "mobile CSS");
```

Leave every other Phase 4 assertion unchanged.

- [ ] **Step 2: Run the verification and confirm the expected failure**

Run: `npm run experience:verify`

Expected: FAIL because `site-header.tsx` still contains `"use client"`, drawer state, and `mobile-menu` markup/styles.

- [ ] **Step 3: Implement the stateless shared header**

In `src/components/site-header.tsx`, remove `"use client"`, React hooks, `createPortal`, `MenuIcon`, `onNavigate`, drawer state/effects, the menu button, and the portal. Keep `HeaderLink` responsible only for internal `Link` versus same-page `<a>` rendering, and render:

```tsx
export function SiteHeader({ links, className = "", brandName = "Alex Bereanu" }: SiteHeaderProps) {
  return (
    <header className={`site-header ${className}`.trim()}>
      <div className="site-header-inner">
        <Link aria-label={`${brandName} home`} className="header-brand" href="/">
          {brandName}
        </Link>

        <nav aria-label="Primary navigation" className="header-nav">
          {links.map((link) => (
            <HeaderLink key={`${link.href}-${link.label}`} {...link} />
          ))}
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Remove drawer CSS and make mobile navigation wrap**

In `src/app/globals.css`:

- Delete all rules from `.mobile-menu-toggle, .mobile-menu-layer` through `.mobile-menu-links .header-link`.
- Keep the base `.header-nav` desktop rule unchanged.
- Replace the mobile `.site-header-inner`, brand, hidden desktop navigation, and visible menu-layer rules with:

```css
  .site-header-inner {
    gap: 0.75rem;
  }

  .site-header .header-brand {
    font-size: clamp(1.7rem, 9vw, 2.25rem);
    transform: none;
  }

  .header-nav {
    flex-wrap: wrap;
    overflow: visible;
    row-gap: 0;
  }
```

Leave the footer, form, gallery, coarse-pointer, and reduced-motion rules unchanged.

- [ ] **Step 5: Run the focused verification and static checks**

Run:

```powershell
npm run experience:verify
npm run lint
npm run typecheck
```

Expected: every command exits with code 0 and the Phase 4 script prints its success message.

- [ ] **Step 6: Build and visually verify responsive behavior**

Run: `npm run build`

Expected: the Next.js production build exits with code 0.

Start the existing development server or `npm run dev`, then inspect `/` at 1440×900, 390×844, and 320×568. Confirm one centered brand, all navigation links directly below it, wrapping on narrow widths, and no hamburger button, overlay, or drawer.

- [ ] **Step 7: Commit the implementation**

```powershell
git add -- scripts/verify-phase4-mobile-resume.mjs src/components/site-header.tsx src/app/globals.css docs/superpowers/plans/2026-08-11-mobile-inline-navigation.md
git commit -m "feat: keep mobile navigation below brand"
```

---

### Task 2: Fit mobile links on one row and tighten the underline

**Files:**
- Modify: `scripts/verify-phase4-mobile-resume.mjs`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Update the mobile CSS verification first**

Replace the wrapping assertion with source-level assertions for `flex-wrap: nowrap`, the responsive mobile font size, the responsive mobile gap, and the underline offset. Keep the 44px coarse-pointer assertion.

- [ ] **Step 2: Run the focused verifier and confirm the expected failure**

Run: `npm run experience:verify`

Expected: FAIL because the approved single-row font, gap, and underline declarations are not yet present.

- [ ] **Step 3: Implement the approved mobile CSS**

Inside `@media (max-width: 768px)`, keep the desktop rules unchanged and set:

```css
  .header-nav {
    flex-wrap: nowrap;
    overflow: visible;
    gap: clamp(0.18rem, 1vw, 0.4rem);
  }

  .site-header .header-nav .header-link {
    font-size: clamp(0.48rem, 2.25vw, 0.58rem);
  }

  .site-header .header-nav .header-link::after {
    bottom: calc(50% - 0.5rem);
  }
```

- [ ] **Step 4: Verify locally at representative widths**

Run:

```powershell
npm run experience:verify
npm run lint
npm run typecheck
npm run build
```

Inspect `/` at 320x568, 390x844, and 1440x900. Confirm one mobile navigation row, no horizontal overflow, a 44px touch target under coarse pointers, an underline approximately 1-2px below its label, and unchanged desktop typography.

- [ ] **Step 5: Commit, merge, and deploy**

Commit the focused verifier and CSS change on `codex/mobile-inline-navigation`, fast-forward `main` after verification, push `main`, and verify the production URL at mobile width.

---

### Task 3: Enlarge mobile navigation typography and spacing

**Files:**
- Modify: `scripts/verify-phase4-mobile-resume.mjs:55`
- Modify: `src/app/globals.css:864-875`

**Interfaces:**
- Consumes: the existing mobile `.header-nav`, `.site-header .header-nav .header-link`, and `.header-link::after` rules.
- Produces: a seven-link, non-wrapping mobile navigation with responsive font and gap values while leaving desktop CSS and the underline offset unchanged.

- [ ] **Step 1: Change the source-level verifier to require the approved values**

In `scripts/verify-phase4-mobile-resume.mjs`, replace the old mobile gap and font fragments with:

```js
"gap: clamp(0.2rem, 1.1vw, 0.45rem)",
"font-size: clamp(0.48rem, 2.4vw, 0.62rem)",
```

Keep the existing `flex-wrap: nowrap`, `min-height: 2.75rem`, and `bottom: calc(50% - 0.5rem)` fragments.

- [ ] **Step 2: Run the focused verifier and confirm the expected failure**

Run: `npm run experience:verify`

Expected: FAIL with the new gap and font fragments reported as missing because the stylesheet still contains the previous values.

- [ ] **Step 3: Apply the minimal mobile-only CSS change**

In `src/app/globals.css`, change only these two declarations inside `@media (max-width: 768px)`:

```css
  .header-nav {
    gap: clamp(0.2rem, 1.1vw, 0.45rem);
  }

  .site-header .header-nav .header-link {
    font-size: clamp(0.48rem, 2.4vw, 0.62rem);
  }
```

- [ ] **Step 4: Run focused and static verification**

Run:

```powershell
npm run experience:verify
npm run lint
npm run typecheck
npm run build
```

Expected: every command exits with code 0.

- [ ] **Step 5: Verify rendered geometry**

Inspect the seven-link portfolio header at 320x568 and 390x844, and the public header at 1440x900. Confirm:

- 320px: 7.68px link type, 3.52px gap, one row, and no horizontal overflow.
- 390px: 9.36px link type, 4.29px gap, one row, and no horizontal overflow.
- Desktop: 11.52px link type remains unchanged.
- Underline: the existing `bottom: calc(50% - 0.5rem)` remains approximately 1-2px below the label.

- [ ] **Step 6: Commit and deploy**

```powershell
git add -- scripts/verify-phase4-mobile-resume.mjs src/app/globals.css
git commit -m "fix: enlarge mobile navigation links"
git push origin main
```

After the deployment completes, repeat the 320px and 390px geometry checks against `https://alex-bereanu.vercel.app`.

# Mobile Inline Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the public navigation visible beneath “Alex Bereanu” at every viewport and wrap the links on narrow mobile screens.

**Architecture:** Simplify `SiteHeader` to one stateless navigation tree shared by desktop and mobile. Remove the drawer-only client behavior and CSS, then use the existing mobile media query to preserve the vertical header layout and enable centered link wrapping.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS, Node.js verification scripts

## Global Constraints

- Desktop must preserve the current centered brand and single-row centered navigation.
- Mobile navigation must appear immediately beneath the centered brand.
- Narrow mobile navigation must wrap into centered rows without shrinking, clipping, or horizontal scrolling.
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

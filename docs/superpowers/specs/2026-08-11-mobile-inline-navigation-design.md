# Mobile Inline Navigation Design

## Goal

Keep the public-site navigation visible beneath the “Alex Bereanu” brand on mobile, matching the desktop header structure and eliminating the side-menu interaction.

## Design

`SiteHeader` will render one primary navigation for every viewport. The brand remains centered above the navigation links. On screens at or below 768px, the header stays vertically stacked and the navigation may wrap into additional centered rows so every link remains visible without horizontal scrolling.

The mobile menu button, portal-based drawer, overlay, focus-management state, and body-scroll locking will be removed because they are no longer used. Existing link rendering, routes, typography, hover states, focus states, and the primary navigation accessible label remain unchanged.

## Responsive Behavior

- Desktop: preserve the current centered brand and single-row centered navigation.
- Mobile: preserve the same order, with the centered navigation immediately beneath the centered brand.
- Narrow mobile: wrap links onto as many centered rows as needed rather than shrinking text, clipping links, or introducing horizontal scrolling.

## Verification

- Add a focused source-level regression check that fails while drawer behavior exists and passes when the header has one always-visible navigation.
- Run lint and TypeScript checks.
- Build the production application.
- Inspect the header at desktop and representative mobile viewport widths, confirming that no menu trigger or side drawer appears and all links remain visible beneath the brand.

## Scope

Only the public `SiteHeader` component and its associated global header styles are in scope. Navigation destinations, page content, footer behavior, and admin navigation are unchanged.

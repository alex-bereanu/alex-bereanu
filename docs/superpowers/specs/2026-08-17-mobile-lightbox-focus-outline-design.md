# Mobile Lightbox Focus Outline Fix

## Problem

After a touch or pointer opens a gallery photo on mobile, closing the lightbox restores focus to the originating photo button. The global `:focus-visible` rule then renders a dark two-pixel outline around that photo. The recently added viewport lock and scroll-position restoration are otherwise correct and must remain unchanged.

## Design

Track whether the lightbox was opened through keyboard activation. Continue running the existing two-frame scroll restoration after every close. For keyboard activation, explicitly return focus to the originating photo button. For touch and mouse activation, explicitly blur that button after restoration because the lightbox library's portal independently returns focus to the opener during cleanup.

Apply the same behavior to both gallery entry points:

- `GalleryLightbox`, used by portfolio and category galleries.
- `PublicGalleryMosaic`, used by shared client galleries.

No CSS override, new dependency, lightbox configuration change, or scroll-lock change is required.

## Accessibility

Keyboard users continue to receive focus restoration and the existing visible focus indicator. Pointer and touch users retain the same scroll position without a misleading persistent outline.

## Verification

Add a regression test proving that the restoration helper still restores scroll while clearing library-restored focus when pointer activation is indicated. Run the focused test red then green, followed by lint, type checking, the existing mobile-experience verification, a production build, and mobile browser reproduction of both gallery entry points. Retain the existing regression check for keyboard focus restoration.

## Deployment

Commit the tested change to `main` and push it to `origin/main`, which is the repository's existing Vercel production deployment path. Verify the push and deployment checks without changing project configuration.

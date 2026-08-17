# Mobile Lightbox Focus Outline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the persistent dark outline after pointer/touch lightbox closes while preserving the recent scroll-position fix and keyboard focus visibility.

**Architecture:** Extend the existing `restoreLightboxOrigin` helper with an explicit focus-restoration flag. Both client gallery entry points derive that flag from the click event (`detail === 0` means keyboard activation), while the helper always performs the existing two-frame scroll restoration.

**Tech Stack:** Next.js 16.2.12, React 19.2.4, TypeScript 5, Node test runner through `tsx`, Yet Another React Lightbox 3.29.2.

## Global Constraints

- Preserve `lockLightboxViewport` and the current two-frame scroll restoration unchanged.
- Preserve a visible focus indicator and focus return for keyboard activation.
- Do not add CSS overrides, dependencies, or lightbox configuration changes.
- Apply identical activation handling to `GalleryLightbox` and `PublicGalleryMosaic`.
- Deploy by pushing the verified `main` branch to `origin/main`.

---

### Task 1: Modality-Aware Lightbox Focus Restoration

**Files:**
- Modify: `src/components/lightbox-close.test.ts`
- Modify: `src/components/lightbox-close.ts`
- Modify: `src/components/gallery-lightbox.tsx`
- Modify: `src/components/public-gallery-mosaic.tsx`
- Modify: `scripts/verify-phase4-mobile-resume.mjs`

**Interfaces:**
- Consumes: React click event `detail`, where `0` represents keyboard-generated activation and a positive value represents pointer/touch activation.
- Produces: `restoreLightboxOrigin(scrollY: number, target: HTMLElement | null, restoreFocus?: boolean): void`; scroll restoration always runs, while keyboard activation focuses the target and pointer activation clears the focus returned by the lightbox portal.

- [x] **Step 1: Write the failing regression test**

Append a test that proves pointer-triggered close restores scroll without focusing the thumbnail:

```ts
test("restores the gallery viewport without returning focus after pointer activation", () => {
  const originalWindow = globalThis.window;
  const events: unknown[] = [];
  const animationFrames: FrameRequestCallback[] = [];

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      requestAnimationFrame(callback: FrameRequestCallback) {
        animationFrames.push(callback);
        return animationFrames.length;
      },
      scrollTo(options: ScrollToOptions) {
        events.push(["scroll", options]);
      },
    },
  });

  try {
    const target = {
      focus(options?: FocusOptions) {
        events.push(["focus", options]);
      },
      blur() {
        events.push(["blur"]);
      },
    } as HTMLElement;

    restoreLightboxOrigin(1800, target, false);
    animationFrames.shift()?.(0);
    animationFrames.shift()?.(0);

    assert.deepEqual(events, [
      ["scroll", { top: 1800, behavior: "instant" }],
      ["blur"],
    ]);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    } else {
      delete (globalThis as { window?: Window }).window;
    }
  }
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm exec -- tsx --test src/components/lightbox-close.test.ts`

Expected: FAIL because the current helper ignores the third argument and still records a focus event.

- [x] **Step 3: Implement the minimal helper change**

Change the helper signature and guard only the existing focus call:

```ts
export function restoreLightboxOrigin(
  scrollY: number,
  target: HTMLElement | null,
  restoreFocus = true,
): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: "instant" });
      if (restoreFocus) {
        target?.focus({ preventScroll: true });
      } else {
        target?.blur();
      }
    });
  });
}
```

- [x] **Step 4: Pass activation modality from both galleries**

In each gallery component, add `const returnFocusEnabledRef = useRef(false);`, set it from `event.detail === 0` when opening, and call:

```ts
restoreLightboxOrigin(
  returnScrollRef.current,
  returnFocusRef.current,
  returnFocusEnabledRef.current,
);
```

For `GalleryLightbox`, extend `openLightbox` with a `restoreFocus: boolean` argument and pass `event.detail === 0` from the album click callback. For `PublicGalleryMosaic`, assign the ref directly inside the existing button click handler.

- [x] **Step 5: Strengthen the existing mobile verification contract**

Require `event.detail === 0` and `returnFocusEnabledRef` in both gallery source checks inside `scripts/verify-phase4-mobile-resume.mjs`, while retaining every existing scroll-lock requirement.

- [x] **Step 6: Run focused verification and verify GREEN**

Run:

```bash
npm exec -- tsx --test src/components/lightbox-close.test.ts
npm run experience:verify
```

Expected: three lightbox tests pass and the Phase 4 verification passes.

- [x] **Step 7: Verify browser behavior at 390×844**

Using the local mobile browser:

1. Scroll to a later homepage photo, open it with a pointer click, close the lightbox, and confirm the original scroll position is restored, the thumbnail is not `:focus-visible`, and no dark outline is computed.
2. Repeat the pointer-close check on a portfolio gallery route.
3. Confirm the focused helper test still covers keyboard focus return with `{ preventScroll: true }`.

- [x] **Step 8: Run the full release gate**

Run: `npm run release:verify`

Expected: lint, type checking, all scripted verification, production build, dependency policy, and production configuration checks exit successfully.

Local result: the focused tests, mobile experience verification, lint (with the unrelated nested `.worktrees/**` excluded), type checking, every admin/quality verification, and the production build passed. The unchanged dependency lock currently reports Prisma advisories, and the production configuration check requires secrets that exist only in the deployment environment; both exceptions are outside this UI hotfix and must remain separate work.

- [x] **Step 9: Commit the implementation**

```bash
git add src/components/lightbox-close.test.ts src/components/lightbox-close.ts src/components/gallery-lightbox.tsx src/components/public-gallery-mosaic.tsx scripts/verify-phase4-mobile-resume.mjs docs/superpowers/plans/2026-08-17-mobile-lightbox-focus-outline.md
git commit -m "fix: hide pointer lightbox return outline"
```

- [ ] **Step 10: Push and verify production**

Run `git push origin main`, confirm `origin/main` resolves to the new commit, wait for the configured Vercel deployment and GitHub quality gate, then run `npm run deployment:verify -- <production-https-url>` and repeat the mobile pointer-close browser check against production.

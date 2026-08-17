import assert from "node:assert/strict";
import test from "node:test";

import { lockLightboxViewport, restoreLightboxOrigin } from "./lightbox-close";

test("locks the lightbox viewport without collapsing the document body", () => {
  const animationFrames: FrameRequestCallback[] = [];
  const scrolls: ScrollToOptions[] = [];
  const style = {
    overflowY: "scroll",
    overscrollBehaviorY: "auto",
    scrollbarGutter: "",
  } as CSSStyleDeclaration;
  const bodyStyle = {
    overflowY: "visible",
    overscrollBehaviorY: "auto",
  } as CSSStyleDeclaration;
  const viewport = {
    scrollTo(options: ScrollToOptions) {
      scrolls.push(options);
    },
    requestAnimationFrame(callback: FrameRequestCallback) {
      animationFrames.push(callback);
      return animationFrames.length;
    },
  };

  const unlock = lockLightboxViewport(
    { style } as HTMLElement,
    { style: bodyStyle } as HTMLElement,
    1800,
    viewport,
  );

  assert.equal(style.overflowY, "hidden");
  assert.equal(style.overscrollBehaviorY, "none");
  assert.equal(style.scrollbarGutter, "stable");
  assert.equal(bodyStyle.overflowY, "hidden");
  assert.equal(bodyStyle.overscrollBehaviorY, "none");
  assert.deepEqual(scrolls, [{ top: 1800, behavior: "instant" }]);

  animationFrames.shift()?.(0);
  assert.deepEqual(scrolls, [
    { top: 1800, behavior: "instant" },
    { top: 1800, behavior: "instant" },
  ]);

  unlock();

  assert.equal(style.overflowY, "scroll");
  assert.equal(style.overscrollBehaviorY, "auto");
  assert.equal(style.scrollbarGutter, "");
  assert.equal(bodyStyle.overflowY, "visible");
  assert.equal(bodyStyle.overscrollBehaviorY, "auto");
  assert.deepEqual(scrolls, [
    { top: 1800, behavior: "instant" },
    { top: 1800, behavior: "instant" },
    { top: 1800, behavior: "instant" },
  ]);
});

test("restores the gallery viewport before returning focus without another scroll", () => {
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
    } as HTMLElement;

    restoreLightboxOrigin(1800, target);
    assert.deepEqual(events, []);

    animationFrames.shift()?.(0);
    assert.deepEqual(events, []);

    animationFrames.shift()?.(0);
    assert.deepEqual(events, [
      ["scroll", { top: 1800, behavior: "instant" }],
      ["focus", { preventScroll: true }],
    ]);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    } else {
      delete (globalThis as { window?: Window }).window;
    }
  }
});

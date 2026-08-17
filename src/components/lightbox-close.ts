type LightboxViewport = {
  scrollTo(options: ScrollToOptions): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;
};

export function lockLightboxViewport(
  root: HTMLElement,
  body: HTMLElement,
  scrollY: number,
  viewport: LightboxViewport = window,
): () => void {
  const { overflowY, overscrollBehaviorY, scrollbarGutter } = root.style;
  const bodyOverflowY = body.style.overflowY;
  const bodyOverscrollBehaviorY = body.style.overscrollBehaviorY;

  root.style.overflowY = "hidden";
  root.style.overscrollBehaviorY = "none";
  root.style.scrollbarGutter = "stable";
  body.style.overflowY = "hidden";
  body.style.overscrollBehaviorY = "none";
  viewport.scrollTo({ top: scrollY, behavior: "instant" });
  viewport.requestAnimationFrame(() => {
    viewport.scrollTo({ top: scrollY, behavior: "instant" });
  });

  return () => {
    root.style.overflowY = overflowY;
    root.style.overscrollBehaviorY = overscrollBehaviorY;
    root.style.scrollbarGutter = scrollbarGutter;
    body.style.overflowY = bodyOverflowY;
    body.style.overscrollBehaviorY = bodyOverscrollBehaviorY;
    viewport.scrollTo({ top: scrollY, behavior: "instant" });
  };
}

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

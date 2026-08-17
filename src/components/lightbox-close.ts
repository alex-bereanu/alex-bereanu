export function restoreLightboxOrigin(
  scrollY: number,
  target: HTMLElement | null,
): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: "instant" });
      target?.focus({ preventScroll: true });
    });
  });
}

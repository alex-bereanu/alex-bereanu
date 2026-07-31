"use client";

import { useEffect, useState } from "react";

const MOBILE_IMAGE_QUERY = "(max-width: 768px), (pointer: coarse)";

export function useMobileImageVariant(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(MOBILE_IMAGE_QUERY).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_IMAGE_QUERY);
    const update = () => setIsMobile(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);

    return () => {
      mediaQuery.removeEventListener("change", update);
    };
  }, []);

  return isMobile;
}

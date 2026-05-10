"use client";

import ReactDOM from "react-dom";

type PhotoResourceHintsProps = {
  publicImageOrigin?: string;
};

export function PhotoResourceHints({ publicImageOrigin }: PhotoResourceHintsProps) {
  if (publicImageOrigin) {
    ReactDOM.preconnect(publicImageOrigin, { crossOrigin: "anonymous" });
  }

  return null;
}

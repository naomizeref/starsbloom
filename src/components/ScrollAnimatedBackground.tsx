import React from "react";

// A static gradient keeps the depth without scroll listeners, animated layers,
// or large blur filters that have to be recomposited while scrolling on phones.
export const ScrollAnimatedBackground: React.FC = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute inset-0 z-0"
    style={{
      background: "radial-gradient(ellipse 700px 500px at 0% 0%, rgba(37,99,235,0.06), transparent), #04060b",
    }}
  />
);

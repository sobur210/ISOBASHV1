"use client";

import dynamic from "next/dynamic";

/**
 * Client entry for the hero sculpture. The three.js scene is loaded lazily and
 * never server-rendered — WebGL has no meaning on the server, and this keeps the
 * three.js bundle out of the landing page's initial JavaScript.
 */
const HeroCubeCanvas = dynamic(() => import("@/components/marketing/hero-cube-canvas"), {
  ssr: false,
  loading: () => null,
});

export function HeroCube() {
  return <HeroCubeCanvas />;
}

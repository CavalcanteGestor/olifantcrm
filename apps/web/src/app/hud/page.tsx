"use client";

import dynamic from "next/dynamic";

const Hud = dynamic(() => import("../ui/hud/Hud"), { ssr: false });

export default function HudPage() {
  return <Hud />;
}


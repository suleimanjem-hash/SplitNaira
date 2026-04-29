"use client";

import { SplitApp } from "@/components/split-app";
import { PageTransition } from "@/components/page-transition";

export default function Home() {
  return (
    <PageTransition motionKey="home">
      <SplitApp />
    </PageTransition>
  );
}

"use client";

import { useEffect } from "react";

export function ScrollEffects() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("motion-ready");

    const revealTargets = Array.from(document.querySelectorAll<HTMLElement>(".reveal, .stagger > *"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("is-visible");
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
    );

    revealTargets.forEach((target) => observer.observe(target));

    let frame = 0;
    const syncMotionVars = () => {
      frame = 0;
      const scrollY = window.scrollY || 0;
      const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      root.style.setProperty("--scroll-y", String(scrollY));
      root.style.setProperty("--scroll-progress", String(Math.min(scrollY / maxScroll, 1)));
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(syncMotionVars);
    };

    const onPointerMove = (event: PointerEvent) => {
      root.style.setProperty("--pointer-x", `${Math.round((event.clientX / window.innerWidth) * 100)}%`);
      root.style.setProperty("--pointer-y", `${Math.round((event.clientY / window.innerHeight) * 100)}%`);
    };

    syncMotionVars();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return null;
}

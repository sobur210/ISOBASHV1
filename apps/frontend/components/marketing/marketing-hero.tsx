"use client";

import { useEffect, useState, useCallback } from "react";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRightIcon, PlayIcon } from "@/components/ui/icons";
import {
  HeroBackgroundSlider,
  HeroSideNavButtons,
  HERO_SLIDES,
} from "@/components/marketing/hero-slider";

const trustPoints = [
  "No vendor lock-in",
  "Runs offline",
  "Nothing simulated",
  "Multi-provider routing",
];

export function MarketingHero() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % HERO_SLIDES.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      nextSlide();
    }, 3500);
    return () => clearInterval(interval);
  }, [nextSlide]);

  return (
    <section className="relative isolate overflow-hidden min-h-[85vh] flex flex-col justify-center">
      {/* Animated Background Images Slider */}
      <HeroBackgroundSlider currentIndex={currentIndex} />

      {/* Slide Navigation Switches on the Left & Right Sides */}
      <HeroSideNavButtons
        onNext={nextSlide}
        onPrev={prevSlide}
        currentIndex={currentIndex}
      />

      <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center text-center px-6 pb-20 pt-16 sm:px-12 lg:px-16 lg:pb-28 lg:pt-24 z-10">
        <div className="animate-rise flex flex-col items-center">
          <h1 className="text-[2.75rem] leading-[1.05] font-bold tracking-[-0.04em] text-balance text-foreground sm:text-6xl lg:text-[4.5rem]">
            Create. Research. Build.
            <span className="text-gradient mt-2 block">All with AI.</span>
          </h1>

          <p className="mt-7 max-w-2xl text-[16px] leading-8 text-pretty text-muted-foreground sm:text-[18px]">
            ISOBASH brings the best models, creative tools, live web research and automation into one
            workspace — routed per request across local and cloud providers, and honest about what it
            cannot do.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <ButtonLink href="/register" size="lg" className="group shadow-glow">
              Start creating free
              <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink href="/app/chat" size="lg" variant="outline" className="glass">
              <PlayIcon className="h-3.5 w-3.5" />
              Open workspace
            </ButtonLink>
          </div>

          <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {trustPoints.map((point) => (
              <li key={point} className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}




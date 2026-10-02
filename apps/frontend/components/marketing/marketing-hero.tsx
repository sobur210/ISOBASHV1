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
          {/**
           * One uniform-size headline line, "Create, Research, Build.", with only
           * "Build." carrying the brand accent inline, then the qualifier below it
           * at a smaller weight. Keeping the accent on a single word mid-line
           * rather than isolating it on its own row means the headline still reads
           * as one sentence while the emphasis lands where the verb is.
           * `text-balance` is dropped: it would try to even out the line lengths
           * and could pull words down into the wrong row, which defeats the point
           * of a deliberate break.
           */}
          <h1 className="text-[2.125rem] leading-[1.12] font-bold tracking-[-0.035em] text-foreground sm:text-[3rem] lg:text-[4rem]">
            <span className="block">Create, Research, <span className="text-primary">Build.</span></span>
            <span className="mt-3 block text-[1.125rem] font-medium leading-snug tracking-[-0.01em] text-foreground sm:mt-4 sm:text-[1.375rem] lg:text-[1.5rem]">
              Anything You Imagine.
            </span>
          </h1>

          {/* `text-muted-foreground` is tuned for text on a solid surface. Over
           * the hero's photograph it loses contrast on the brighter frames, so
           * the supporting copy is pulled toward `text-foreground` and held back
           * with opacity instead. That keeps it clearly subordinate to the
           * headline while staying legible against every slide. */}
          <p className="mt-6 max-w-2xl text-[16px] leading-7 text-pretty text-foreground/80 light:text-foreground/75 sm:text-[17px] sm:leading-8">
            ISOBASH brings the best models, creative tools, live web research and automation into one
            workspace, routed per request across local and cloud providers, and honest about what it
            cannot do.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
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
              <li key={point} className="flex items-center gap-2 text-[13px] font-medium text-foreground/75 light:text-foreground/70">
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




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
        {/**
         * Copy scrim: a pool of the page background behind the text block, fading
         * to nothing well before the slide edges so the photograph still reads
         * around the outside.
         *
         * It lives here rather than in the slider because it has to be sized
         * against the copy, not the viewport. The copy column is `max-w-4xl`, so
         * on a wide screen the text occupies well under half the hero and there
         * is room to fade out; on a phone the same column spans the full width
         * and the text reaches the edges. A gradient sized in percentages of the
         * hero tracked the viewport instead and under-covered the paragraph below
         * ~768px, dropping it to 4.3:1 on the brightest frames. Anchored to this
         * wrapper and overhanging it on all sides, the plateau always encloses
         * the text with a consistent margin at every width.
         *
         * The negatives extend the pool past the text so the fade begins off to
         * the sides of the copy rather than on top of it, and `-z-10` keeps it
         * behind the text while still above the photo. `var(--background)` makes
         * it darken in dark mode and wash toward white in light mode, so one
         * declaration serves both themes.
         */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[-12%] inset-y-[-18%] -z-10 opacity-95 bg-[radial-gradient(ellipse_75%_60%_at_50%_50%,var(--background)_0%,var(--background)_60%,transparent_90%)]"
        />
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
           * headline while staying legible against every slide.
           *
           * The same value covers both themes: the copy scrim below is built from
           * `var(--background)`, so light mode lands on a white wash and dark
           * mode on a near-black one, and `/80` clears 4.5:1 on both (measured
           * 7.5:1 light, 10.6:1 dark). A `light:` variant override was tried
           * here but is not applied by the build, so the extra class was dropped
           * rather than left in as a no-op. */}
          <p className="mt-6 max-w-2xl text-[16px] leading-7 text-pretty text-foreground/80 sm:text-[17px] sm:leading-8">
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
              <li key={point} className="flex items-center gap-2 text-[13px] font-medium text-foreground/75">
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




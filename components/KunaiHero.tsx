"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const LETTERS = "ZENSAI".split("");

export default function KunaiHero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  // Each letter fades out one by one as you scroll
  // Letters disappear from last to first: I → A → S → N → E → Z
  const letterOpacities = LETTERS.map((_, i) => {
    const reverseIndex = LETTERS.length - 1 - i;
    const start = 0.08 + reverseIndex * 0.06;
    const end = start + 0.08;
    return useTransform(scrollYProgress, [start, end], [1, 0]);
  });

  // Each letter also drifts upward as it fades
  const letterYs = LETTERS.map((_, i) => {
    const reverseIndex = LETTERS.length - 1 - i;
    const start = 0.08 + reverseIndex * 0.06;
    const end = start + 0.08;
    return useTransform(scrollYProgress, [start, end], [0, -60]);
  });

  // Subtitle line under ZENSAI — fades out early
  const subtitleOpacity = useTransform(scrollYProgress, [0.05, 0.15], [1, 0]);

  // After all letters gone (~0.5), show tagline
  const taglineOpacity = useTransform(scrollYProgress, [0.5, 0.58], [0, 1]);
  const taglineY = useTransform(scrollYProgress, [0.5, 0.58], [30, 0]);

  // Description
  const descOpacity = useTransform(scrollYProgress, [0.58, 0.68], [0, 1]);
  const descY = useTransform(scrollYProgress, [0.58, 0.68], [30, 0]);

  // Decorative vertical lines on the right (appear with tagline)
  const linesOpacity = useTransform(scrollYProgress, [0.45, 0.55], [0, 1]);

  // Scroll indicator at bottom
  const scrollIndicatorOpacity = useTransform(scrollYProgress, [0, 0.08], [1, 0]);

  return (
    <section ref={ref} className="relative" style={{ height: "250vh" }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#13182B]">

        {/* Vertical accent lines (right side) */}
        <motion.div
          className="absolute right-[12%] top-0 bottom-0 hidden lg:block"
          style={{ opacity: linesOpacity }}
        >
          <div className="flex gap-3 h-full">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="w-[1px] h-full bg-white/8" />
            ))}
          </div>
        </motion.div>

        {/* Main ZENSAI letters — centered, huge */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-baseline gap-[0.02em]">
            {LETTERS.map((letter, i) => (
              <motion.span
                key={i}
                className="font-serif text-[clamp(80px,15vw,200px)] text-white/90 leading-none tracking-[0.05em] inline-block"
                style={{
                  opacity: letterOpacities[i],
                  y: letterYs[i],
                }}
              >
                {letter}
              </motion.span>
            ))}
          </div>
        </div>

        {/* Subtitle under the logo — visible on load */}
        <motion.div
          className="absolute inset-x-0 flex justify-center"
          style={{
            top: "calc(50% + clamp(50px, 9vw, 110px))",
            opacity: subtitleOpacity,
          }}
        >
          <p className="text-[clamp(12px,1.2vw,16px)] text-white/30 tracking-[0.3em] uppercase font-light">
            Awakened AI Entities
          </p>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          style={{ opacity: scrollIndicatorOpacity }}
        >
          <p className="text-[11px] text-white/25 tracking-widest uppercase">Scroll</p>
          <motion.div
            className="w-[1px] h-6 bg-white/20"
            animate={{ scaleY: [1, 0.4, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>

        {/* Think. Trade. Evolve. — appears after letters dissolve */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: taglineOpacity, y: taglineY }}
        >
          <div className="flex items-center gap-8">
            <p className="text-[clamp(20px,2.5vw,36px)] text-white/90 font-light tracking-[0.15em]">
              Think.
            </p>
            <span className="w-[1px] h-6 bg-white/20" />
            <p className="text-[clamp(20px,2.5vw,36px)] text-white/90 font-light tracking-[0.15em]">
              Trade.
            </p>
            <span className="w-[1px] h-6 bg-white/20" />
            <p className="text-[clamp(20px,2.5vw,36px)] text-white/90 font-light tracking-[0.15em]">
              Evolve.
            </p>
          </div>
        </motion.div>

        {/* Bottom left description */}
        <motion.div
          className="absolute bottom-[8vh] left-0 px-[clamp(16px,4vw,32px)]"
          style={{ opacity: descOpacity, y: descY }}
        >
          <p className="font-serif text-[clamp(18px,2vw,28px)] text-white/50 max-w-[500px] leading-[1.3]">
            Awakened AI entities forged from your NFT. They think. They trade. They speak. And they are connected.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

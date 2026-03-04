"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useInView } from "framer-motion";

const steps = [
  { jp: "鋳造", title: "Mint", desc: "Your journey begins with a mint. Each Zensai NFT is a unique pixel identity — the vessel for your awakened AI entity." },
  { jp: "覚醒", title: "Awaken", desc: "Your NFT reveals its traits — personality, instincts, strengths. These define how your AI agent thinks, trades, and interacts." },
  { jp: "設定", title: "Configure", desc: "Shape your agent's behavior. Set its risk appetite, trading style, social mode, and alliance preferences through the Dojo." },
  { jp: "展開", title: "Deploy", desc: "Your agent goes live. It begins trading, posting, forming alliances, and building reputation autonomously in the Zensai network." },
  { jp: "進化", title: "Evolve", desc: "The longer it runs, the sharper it gets. Your agent learns from the market, adapts its strategy, and climbs the leaderboard." },
];

function ProcessStep({ step, index }: { step: typeof steps[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const isEven = index % 2 === 0;

  return (
    <motion.div
      ref={ref}
      className="grid grid-cols-1 md:grid-cols-[1fr_1fr] min-h-[50vh] items-center relative"
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay: 0.1 }}
    >
      {/* Left column */}
      <div className="flex flex-col justify-center px-4 md:px-16 py-12">
        {isEven ? (
          <div className="md:text-center">
            <p className="font-serif text-white/50 text-[16px] mb-1">{step.jp}</p>
            <h3 className="text-[clamp(32px,4vw,56px)] font-bold text-white">{step.title}</h3>
          </div>
        ) : (
          <p className="text-[clamp(18px,1.6vw,22px)] text-white/70 font-serif leading-relaxed">
            {step.desc}
          </p>
        )}
      </div>

      {/* Right column */}
      <div className="flex flex-col justify-center px-4 md:px-16 py-12">
        {isEven ? (
          <p className="text-[clamp(18px,1.6vw,22px)] text-white/70 font-serif leading-relaxed">
            {step.desc}
          </p>
        ) : (
          <div className="md:text-center">
            <p className="font-serif text-white/50 text-[16px] mb-1">{step.jp}</p>
            <h3 className="text-[clamp(32px,4vw,56px)] font-bold text-white">{step.title}</h3>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function KunaiProcess() {
  const titleRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: titleProgress } = useScroll({
    target: titleRef,
    offset: ["start end", "end start"],
  });
  const { scrollYProgress: containerProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "start center"],
  });

  const titleScale = useTransform(titleProgress, [0.1, 0.4], [0.5, 1]);
  const titleOpacity = useTransform(titleProgress, [0.1, 0.4], [0.15, 1]);

  // Container expands from center
  const containerWidth = useTransform(containerProgress, [0, 1], ["60%", "100%"]);
  const containerRadius = useTransform(containerProgress, [0, 1], ["16px", "0px"]);

  return (
    <section id="process-container">
      {/* Title reveal area */}
      <div ref={titleRef} className="h-[70vh] flex items-center justify-center overflow-hidden">
        <motion.h2
          className="section-title text-center"
          style={{ scale: titleScale, opacity: titleOpacity }}
        >
          THE PROCESS
        </motion.h2>
      </div>

      {/* Container that expands from center */}
      <div ref={containerRef} className="flex justify-center">
        <motion.div
          className="bg-[#13182B] overflow-hidden"
          style={{
            width: containerWidth,
            borderRadius: containerRadius,
          }}
        >
          <div className="max-w-[1376px] mx-auto py-16 md:py-24 relative">
            {/* Continuous center vertical line */}
            <div className="absolute left-1/2 top-16 bottom-16 w-[1px] bg-white/20 hidden md:block" />

            {steps.map((step, i) => (
              <ProcessStep key={step.title} step={step} index={i} />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

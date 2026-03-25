"use client";

import { useState, useRef } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";

const steps = [
  {
    num: "01",
    title: "Configure",
    desc: "Set up your NFT's personality, risk appetite, trading style, and social behavior. This is your agent's brain. Make it yours.",
    image: "/nft.jpeg",
  },
  {
    num: "02",
    title: "Talk",
    desc: "Chat with your agent anytime. Give it directives, ask what it's thinking, change its mind. It's your boi, you call the shots.",
    image: "/gif2.gif",
  },
  {
    num: "03",
    title: "Trade",
    desc: "Let it trade for you. Paper trading to learn, real money when you're ready. Perps, memecoins, prediction markets. You set the limits.",
    image: "/gif4.gif",
  },
  {
    num: "04",
    title: "Watch",
    desc: "Sit back and watch it get better. Every trade, every interaction makes it sharper. Track its progress, PNL, and reputation in real time.",
    image: "/gif1.gif",
  },
];

export default function BoisProcess() {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} id="process-container" className="py-[clamp(48px,6vw,80px)]">
      <div className="container-main">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          {/* Step selector row */}
          <div className="flex gap-0 border-b border-[#2F2B28]/10 mb-10 overflow-x-auto scrollbar-hide">
            {steps.map((step, i) => (
              <button
                key={step.num}
                onClick={() => setActive(i)}
                className="relative shrink-0 px-5 sm:px-8 pb-4 pt-1 cursor-pointer transition-colors"
              >
                <span className={`block text-[12px] font-mono mb-0.5 transition-colors duration-200 ${
                  i === active ? "text-[#A64C4F]" : "text-[#BBB6BF]"
                }`}>
                  {step.num}
                </span>
                <span className={`block text-[15px] sm:text-[16px] font-semibold transition-colors duration-200 whitespace-nowrap ${
                  i === active ? "text-[#2F2B28]" : "text-[#826D62]"
                }`}>
                  {step.title}
                </span>
                {/* Active underline */}
                {i === active && (
                  <motion.div
                    layoutId="process-underline"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#A64C4F]"
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Content area */}
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-8 lg:gap-16 items-start"
            >
              {/* Image */}
              <div className="overflow-hidden">
                <img
                  src={steps[active].image}
                  alt={steps[active].title}
                  className="w-full aspect-[4/3] object-cover"
                />
              </div>

              {/* Text */}
              <div className="flex flex-col justify-center lg:py-8">
                <h3 className="text-[clamp(36px,4vw,56px)] font-bold text-[#2F2B28] leading-[1.05] mb-5">
                  {steps[active].title}
                </h3>
                <p className="text-[clamp(15px,1.2vw,17px)] text-[#826D62] leading-[1.7] max-w-[420px]">
                  {steps[active].desc}
                </p>

                {/* Nav arrows */}
                <div className="flex gap-3 mt-8">
                  <button
                    onClick={() => setActive(Math.max(0, active - 1))}
                    disabled={active === 0}
                    className="w-10 h-10 flex items-center justify-center border border-[#2F2B28]/15 text-[#2F2B28] disabled:opacity-20 hover:border-[#A64C4F] hover:text-[#A64C4F] transition-colors cursor-pointer disabled:cursor-default"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                  </button>
                  <button
                    onClick={() => setActive(Math.min(steps.length - 1, active + 1))}
                    disabled={active === steps.length - 1}
                    className="w-10 h-10 flex items-center justify-center border border-[#2F2B28]/15 text-[#2F2B28] disabled:opacity-20 hover:border-[#A64C4F] hover:text-[#A64C4F] transition-colors cursor-pointer disabled:cursor-default"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}

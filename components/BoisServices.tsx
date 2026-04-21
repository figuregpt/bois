"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const activities = [
  "Carry backstories",
  "Form crews",
  "Start beef",
  "Settle scores",
  "Keep secrets",
  "Chase legends",
  "Earn respect",
  "Hold grudges",
  "Leave scars",
];

export default function BoisServices() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} id="service-section" className="py-[clamp(64px,8vw,120px)]">
      <div className="container-main">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
          {/* Left: concept */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-[clamp(32px,3.5vw,48px)] font-bold text-[#2F2B28] leading-[1.1] mb-6">
              A universe of characters.<br />Built on stories.
            </h2>
            <p className="text-[clamp(15px,1.2vw,17px)] text-[#826D62] leading-[1.7] mb-8 max-w-[440px]">
              Bois aren't pfp filler. They're characters with histories, attitudes, and unfinished business. Every one of them carries a piece of the lore,and the lore only moves forward when the crew does.
            </p>

            {/* Activity tags */}
            <div className="flex flex-wrap gap-2">
              {activities.map((a, i) => (
                <motion.span
                  key={a}
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : {}}
                  transition={{ delay: 0.3 + i * 0.04 }}
                  className="text-[13px] text-[#2F2B28] px-4 py-2 border border-[#2F2B28]/12 hover:border-[#A64C4F]/30 hover:text-[#A64C4F] transition-colors cursor-default"
                >
                  {a}
                </motion.span>
              ))}
            </div>
          </motion.div>

          {/* Right: artwork stack */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative"
          >
            <div className="grid grid-cols-2 gap-3">
              <img src="/nft.jpeg" alt="" className="w-full aspect-[3/4] object-cover" />
              <div className="flex flex-col gap-3">
                <img src="/gif2.gif" alt="" className="w-full aspect-square object-cover" />
                <img src="/gif1.gif" alt="" className="w-full aspect-[4/3] object-cover" />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

export default function BoisManifesto() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="bg-[#2F2B28] py-[clamp(80px,12vw,160px)]">
      <div className="container-main">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-12 lg:gap-20 items-center">
          {/* Left,artwork collage */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6 }}
            className="grid grid-cols-2 gap-3"
          >
            <img src="/nft.jpeg" alt="" className="w-full aspect-square object-cover" />
            <img src="/gif2.gif" alt="" className="w-full aspect-square object-cover" />
            <img src="/gif1.gif" alt="" className="w-full aspect-square object-cover col-span-2" />
          </motion.div>

          {/* Right,manifesto text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <p className="text-[13px] text-[#A64C4F] tracking-[0.15em] uppercase mb-6">
              Why we're here
            </p>

            <h2 className="text-[clamp(28px,3vw,42px)] font-bold text-[#EDE3BC] leading-[1.2] mb-8">
              We miss when web3 actually meant something.
            </h2>

            <div className="space-y-5 text-[clamp(15px,1.1vw,17px)] text-[#EDE3BC]/50 leading-[1.7]">
              <p>
                Back when communities were tight, people actually knew each other, and building together felt like something real. Before the rugs, the grifters, and the hype cycles killed the vibe.
              </p>
              <p>
                We still believe that onchain communities are the best way to bring people together. Not because of the tech, but because of what it enables. Ownership. Identity. Shared upside. Real skin in the game.
              </p>
              <p>
                BOIS is our attempt to bring that energy back. A crew of characters born from art, each with their own story, their own scars, their own reasons for showing up. Owned by the people who mint them. No roadmap fluff. No empty promises. Just bois being bois.
              </p>
            </div>

            <div className="mt-10 flex items-center gap-4">
              <span className="w-8 h-[1px] bg-[#A64C4F]" />
              <p className="text-[14px] text-[#A64C4F] font-medium">The BOIS team</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

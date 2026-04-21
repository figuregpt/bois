"use client";

import { useState, useRef } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";

const faqs = [
  {
    q: "Yo what even is BOIS?",
    a: "BOIS is a crew of characters pulled straight from the streets. Each one is a unique NFT with its own face, its own history, its own reasons for being here. Mint one and you don't just own art,you inherit a story that's still being written.",
  },
  {
    q: "How do I cop a BOIS NFT?",
    a: "Mint day is coming. Follow our socials so you don't miss the drop. Whitelist spots, early access, the whole nine. If you're late, that's on you bro.",
  },
  {
    q: "What makes every boi different?",
    a: "Traits aren't just visual. Every scar, every fit, every look ties into who they are and where they came from. Some bois run in packs. Some ride solo. Some owe favors. Some are owed. No two bois carry the same story.",
  },
  {
    q: "What's the lore about?",
    a: "The streets, the crews, the beef, the loyalty. Bois is built around characters who've already lived a life before you showed up,and the chapters keep coming. Community drives where the story goes. Your boi is your seat at the table.",
  },
  {
    q: "Why should I hold?",
    a: "Because holders eat. 80% of every royalty goes back to the community, streamed back to holders every week. Own a boi, earn from the crew. That's the whole point.",
  },
  {
    q: "What chain is BOIS on?",
    a: "Solana.",
  },
  {
    q: "What's Rug.World?",
    a: "Our launchpad. Every collection that drops through Rug.World inherits the same Royalty Share system BOIS runs on,so the crew keeps growing and holders keep getting paid. More on that soon.",
  },
];

function FAQItem({ faq }: { faq: typeof faqs[0] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="faq-item" onClick={() => setOpen(!open)}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-[clamp(15px,1.2vw,17px)] text-[#2F2B28] font-medium">{faq.q}</p>
        <svg
          className="faq-chevron flex-shrink-0 w-4 h-4 text-[#826D62]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <p className="text-[14px] text-[#826D62] leading-relaxed mt-4 pr-8">
              {faq.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function BoisFAQ() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} id="faq-section" className="py-[clamp(60px,8vw,120px)]">
      <div className="container-main">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-12 lg:gap-20">
          {/* Left title */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <h2 className="section-title">FAQ</h2>
            <p className="mt-4 text-[15px] text-[#826D62] leading-relaxed max-w-[280px]">
              Everything you need to know before you send it.
            </p>
          </motion.div>

          {/* Right accordion */}
          <div>
            {faqs.map((faq, i) => (
              <FAQItem key={i} faq={faq} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

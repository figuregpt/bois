"use client";

import { motion } from "framer-motion";

const steps = [
  {
    num: "01",
    title: "Get a Zensai NFT",
    desc: "Mint or buy a Zensai NFT — your key to owning an autonomous AI agent on Solana.",
  },
  {
    num: "02",
    title: "Connect & Enter",
    desc: "Head to the dashboard, connect your wallet, and activate your agent. No code required.",
  },
  {
    num: "03",
    title: "Shape Your AI",
    desc: "Customize your agent's personality, risk appetite, and social style — all through simple clicks.",
  },
  {
    num: "04",
    title: "Set Trade Strategy",
    desc: "Pick your trading approach — aggressive, conservative, or balanced. Your agent handles the execution.",
  },
  {
    num: "05",
    title: "Release into the Network",
    desc: "Drop your agent into the live network. It trades, socializes, and evolves — fully on its own.",
  },
];

export default function HowItWorks() {
  return (
    <section className="section-padding">
      <div className="container-main">
        {/* Centered header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-[clamp(40px,5vw,72px)]"
        >
          <h2 className="text-[clamp(1.75rem,3.5vw,2.625rem)] font-bold text-black tracking-[-0.02em] leading-tight mb-4">
            How it works
          </h2>
          <p className="text-[clamp(0.8rem,1.1vw,1rem)] text-black/40 max-w-md 2xl:max-w-lg mx-auto">
            No code required. Everything is done with clicks.
          </p>
        </motion.div>

        {/* Mobile: horizontal scroll slider */}
        <div className="sm:hidden flex gap-4 overflow-x-auto overflow-y-hidden snap-x snap-mandatory pb-4 -mx-4 px-4 scrollbar-hide" style={{ touchAction: "pan-x" }}>
          {steps.map((step) => (
            <div
              key={step.num}
              className="light-card p-6 min-w-[240px] max-w-[260px] snap-center shrink-0"
            >
              <span className="text-xs font-semibold text-accent mb-4 block">{step.num}</span>
              <h3 className="text-sm font-semibold text-black mb-2">{step.title}</h3>
              <p className="text-sm text-black/40 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>

        {/* Desktop: grid */}
        <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-5 gap-[clamp(16px,2vw,24px)]">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="light-card light-card-hover p-[clamp(20px,2.5vw,32px)]"
            >
              <span className="text-xs font-semibold text-accent mb-4 block">{step.num}</span>
              <h3 className="text-[clamp(0.9rem,1.2vw,1.1rem)] font-semibold text-black mb-2">{step.title}</h3>
              <p className="text-[clamp(0.8rem,1vw,0.95rem)] text-black/40 leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}

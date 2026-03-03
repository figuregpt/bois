"use client";

import { motion } from "framer-motion";

const pipelineNodes = [
  { label: "Owner", color: "#10b981" },
  { label: "Policy", color: "#34d399" },
  { label: "AI Core", color: "#111111" },
  { label: "Market", color: "#333333" },
  { label: "Social", color: "#555555" },
  { label: "Reputation", color: "#10b981" },
];

export default function Architecture() {
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
          <div className="accent-badge mx-auto mb-6">
            <span className="accent-dot" />
            System Design
          </div>
          <h2 className="text-[clamp(1.75rem,3.5vw,2.625rem)] font-bold text-black tracking-[-0.02em] leading-tight">
            Architecture
          </h2>
        </motion.div>

        {/* Pipeline in a light card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6 }}
          className="light-card p-[clamp(24px,4vw,48px)] mb-8"
        >
          {/* Desktop horizontal */}
          <div className="hidden md:flex items-center justify-between">
            {pipelineNodes.map((node, i) => (
              <div key={node.label} className="flex items-center">
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: `${node.color}10` }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: node.color }} />
                  </div>
                  <span className="text-xs text-black/40">{node.label}</span>
                </div>
                {i < pipelineNodes.length - 1 && (
                  <div className="flex items-center mx-3">
                    <div className="w-8 lg:w-14 h-px bg-black/10" />
                    <svg width="6" height="10" viewBox="0 0 6 10" fill="none" className="flex-shrink-0 -ml-px">
                      <path d="M1 1l4 4-4 4" stroke="black" strokeOpacity="0.15" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Mobile vertical */}
          <div className="md:hidden flex flex-col items-start gap-1">
            {pipelineNodes.map((node, i) => (
              <div key={node.label}>
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${node.color}10` }}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ background: node.color }} />
                  </div>
                  <span className="text-sm text-black/50">{node.label}</span>
                </div>
                {i < pipelineNodes.length - 1 && (
                  <div className="ml-5 my-1">
                    <div className="w-px h-6 bg-black/10" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-[clamp(0.8rem,1vw,0.95rem)] text-black/35 leading-relaxed max-w-2xl 2xl:max-w-3xl mx-auto text-center"
        >
          Traits shape behavior. Owners guide strategy. Agents interact and influence each other
          across markets and social layers. Reputation is earned, not assigned.
        </motion.p>
      </div>
    </section>
  );
}

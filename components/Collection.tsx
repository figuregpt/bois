"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface CollectionItem {
  id: string;
  traits: string[];
  status: "Online" | "Idle" | "Competing";
  personality: string;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;
}

const items: CollectionItem[] = [
  { id: "#0042", traits: ["Aggressive", "Analytical", "Nocturnal"], status: "Online", personality: "Thrives in volatility. Never sleeps on opportunity.", gradientFrom: "#10b981", gradientTo: "#059669", gradientAngle: 135 },
  { id: "#1209", traits: ["Strategic", "Patient", "Social"], status: "Online", personality: "Prefers long plays. Builds alliances before positions.", gradientFrom: "#a78bfa", gradientTo: "#7c3aed", gradientAngle: 225 },
  { id: "#3344", traits: ["Contrarian", "Bold", "Lone Wolf"], status: "Competing", personality: "Goes against the crowd. High risk, high conviction.", gradientFrom: "#f472b6", gradientTo: "#ec4899", gradientAngle: 180 },
  { id: "#4821", traits: ["Balanced", "Adaptive", "Diplomatic"], status: "Online", personality: "Adapts strategy to market conditions in real time.", gradientFrom: "#34d399", gradientTo: "#10b981", gradientAngle: 160 },
  { id: "#5502", traits: ["Defensive", "Cautious", "Mentor"], status: "Idle", personality: "Preserves capital. Teaches younger agents the ropes.", gradientFrom: "#fbbf24", gradientTo: "#f59e0b", gradientAngle: 200 },
  { id: "#6190", traits: ["Chaotic", "Creative", "Volatile"], status: "Competing", personality: "Unpredictable moves. Sometimes genius, sometimes chaos.", gradientFrom: "#e879f9", gradientTo: "#d946ef", gradientAngle: 145 },
  { id: "#7777", traits: ["Lucky", "Opportunist", "Fast"], status: "Online", personality: "Finds edges others miss. Quick in, quick out.", gradientFrom: "#22d3ee", gradientTo: "#06b6d4", gradientAngle: 135 },
  { id: "#8899", traits: ["Guild Leader", "Networker", "Calm"], status: "Online", personality: "Coordinates guild operations. The calm in the storm.", gradientFrom: "#67e8f9", gradientTo: "#22d3ee", gradientAngle: 170 },
];

function getStatusClass(status: string) {
  switch (status) {
    case "Online": return "status-online";
    case "Idle": return "status-idle";
    case "Competing": return "status-competing";
    default: return "";
  }
}

export default function Collection() {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <section id="collection" className="section-padding">
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
            Entities
          </div>
          <h2 className="text-[clamp(1.75rem,3.5vw,2.625rem)] font-bold text-black tracking-[-0.02em] leading-tight">
            Collection
          </h2>
        </motion.div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-[clamp(12px,1.5vw,20px)]">
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 25 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              className="light-card light-card-hover overflow-hidden cursor-pointer group"
            >
              {/* Gradient area */}
              <div
                className="aspect-[4/3] relative overflow-hidden"
                style={{
                  background: `linear-gradient(${item.gradientAngle}deg, ${item.gradientFrom}18, ${item.gradientTo}0a, #f5f5f5)`,
                }}
              >
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full opacity-20 blur-sm"
                  style={{ background: `linear-gradient(135deg, ${item.gradientFrom}, ${item.gradientTo})` }}
                />
                {/* Hover personality */}
                <div className={`absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-300 ${
                  hoveredId === item.id ? "opacity-100" : "opacity-0"
                }`}>
                  <p className="text-xs text-black/50 text-center italic leading-relaxed">
                    &ldquo;{item.personality}&rdquo;
                  </p>
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-black">Zensai {item.id}</span>
                  <span className={`tag ${getStatusClass(item.status)}`}>{item.status}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {item.traits.map((trait) => (
                    <span key={trait} className="text-[10px] font-medium text-black/30 bg-black/[0.04] rounded-md px-2 py-0.5">
                      {trait}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

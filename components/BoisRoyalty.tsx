"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

export default function BoisRoyalty() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  // Donut geometry
  const size = 260;
  const stroke = 44;
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * radius;
  // Pie shows the royalty split (of the 10% pool), not of total trade
  const holderPct = 80;
  const teamPct = 20;
  const holderLen = (holderPct / 100) * circ;
  const teamLen = (teamPct / 100) * circ;

  // Label geometry (angles measured clockwise from 12 o'clock)
  const outerR = radius + stroke / 2;
  const labelR = outerR + 18;
  const communityMid = (holderPct / 2 / 100) * 2 * Math.PI;
  const teamMid = ((holderPct + teamPct / 2) / 100) * 2 * Math.PI;

  const buildLabel = (angle: number) => {
    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);
    const start = { x: cx + outerR * sinA, y: cy - outerR * cosA };
    const end = { x: cx + labelR * sinA, y: cy - labelR * cosA };
    const isRight = sinA >= 0;
    const label = { x: end.x + (isRight ? 30 : -30), y: end.y };
    const anchor: "start" | "end" = isRight ? "start" : "end";
    return { start, end, label, anchor };
  };

  const c = buildLabel(communityMid);
  const t = buildLabel(teamMid);

  return (
    <section ref={ref} id="royalty" className="py-[clamp(48px,6vw,80px)]">
      <div className="container-main">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <div className="border-b border-[#2F2B28]/10 mb-10 pb-4">
            <span className="block text-[12px] font-mono text-[#A64C4F] mb-0.5">
              05
            </span>
            <span className="block text-[15px] sm:text-[16px] font-semibold text-[#2F2B28]">
              Royalties
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-10 lg:gap-16 items-center">
            {/* Donut chart */}
            <div className="flex justify-center lg:justify-start">
              <div className="relative" style={{ width: size, height: size }}>
                <svg
                  width={size}
                  height={size}
                  viewBox={`0 0 ${size} ${size}`}
                  style={{ overflow: "visible" }}
                >
                  <g transform={`rotate(-90 ${cx} ${cy})`}>
                    {/* Base ring */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius}
                      fill="none"
                      stroke="#2F2B28"
                      strokeOpacity="0.08"
                      strokeWidth={stroke}
                    />
                    {/* Community slice 8% */}
                    <motion.circle
                      cx={cx}
                      cy={cy}
                      r={radius}
                      fill="none"
                      stroke="#A64C4F"
                      strokeWidth={stroke}
                      strokeDasharray={`${holderLen} ${circ - holderLen}`}
                      initial={{ strokeDashoffset: holderLen }}
                      animate={inView ? { strokeDashoffset: 0 } : {}}
                      transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                      strokeLinecap="butt"
                    />
                    {/* Team slice 2% */}
                    <motion.circle
                      cx={cx}
                      cy={cy}
                      r={radius}
                      fill="none"
                      stroke="#2F2B28"
                      strokeWidth={stroke}
                      strokeDasharray={`${teamLen} ${circ - teamLen}`}
                      strokeDashoffset={-holderLen}
                      initial={{ opacity: 0 }}
                      animate={inView ? { opacity: 1 } : {}}
                      transition={{ duration: 0.6, delay: 1.1 }}
                      strokeLinecap="butt"
                    />
                  </g>

                  {/* Leader lines + labels (not rotated) */}
                  <motion.g
                    initial={{ opacity: 0 }}
                    animate={inView ? { opacity: 1 } : {}}
                    transition={{ duration: 0.5, delay: 1.3 }}
                  >
                    {/* Community */}
                    <line
                      x1={c.start.x}
                      y1={c.start.y}
                      x2={c.end.x}
                      y2={c.end.y}
                      stroke="#A64C4F"
                      strokeWidth="1.2"
                    />
                    <line
                      x1={c.end.x}
                      y1={c.end.y}
                      x2={c.label.x + (c.anchor === "start" ? -4 : 4)}
                      y2={c.label.y}
                      stroke="#A64C4F"
                      strokeWidth="1.2"
                    />
                    <text
                      x={c.label.x}
                      y={c.label.y - 4}
                      fontSize="10"
                      fontFamily="ui-monospace, monospace"
                      fill="#A64C4F"
                      letterSpacing="1"
                      textAnchor={c.anchor}
                    >
                      COMMUNITY
                    </text>
                    <text
                      x={c.label.x}
                      y={c.label.y + 12}
                      fontSize="15"
                      fontWeight="700"
                      fill="#2F2B28"
                      textAnchor={c.anchor}
                    >
                      80%
                    </text>

                    {/* Team */}
                    <line
                      x1={t.start.x}
                      y1={t.start.y}
                      x2={t.end.x}
                      y2={t.end.y}
                      stroke="#2F2B28"
                      strokeOpacity="0.5"
                      strokeWidth="1.2"
                    />
                    <line
                      x1={t.end.x}
                      y1={t.end.y}
                      x2={t.label.x + (t.anchor === "start" ? -4 : 4)}
                      y2={t.label.y}
                      stroke="#2F2B28"
                      strokeOpacity="0.5"
                      strokeWidth="1.2"
                    />
                    <text
                      x={t.label.x}
                      y={t.label.y - 4}
                      fontSize="10"
                      fontFamily="ui-monospace, monospace"
                      fill="#826D62"
                      letterSpacing="1"
                      textAnchor={t.anchor}
                    >
                      TEAM
                    </text>
                    <text
                      x={t.label.x}
                      y={t.label.y + 12}
                      fontSize="15"
                      fontWeight="700"
                      fill="#2F2B28"
                      textAnchor={t.anchor}
                    >
                      20%
                    </text>
                  </motion.g>
                </svg>

                {/* Center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[13px] font-mono text-[#A64C4F] tracking-[0.1em]">
                    ROYALTY
                  </span>
                  <span className="text-[56px] font-bold text-[#2F2B28] leading-none mt-1">
                    10%
                  </span>
                  <span className="text-[12px] text-[#826D62] mt-2">
                    royalty pool
                  </span>
                </div>
              </div>
            </div>

            {/* Text */}
            <div className="flex flex-col justify-center lg:py-4">
              <h3 className="text-[clamp(32px,3.4vw,48px)] font-bold text-[#2F2B28] leading-[1.1] mb-5">
                Holders eat every week.
              </h3>
              <p className="text-[clamp(15px,1.2vw,17px)] text-[#826D62] leading-[1.7] max-w-[460px] mb-7">
                Every secondary sale pays a 10% royalty. Of that pool, 80%
                streams back to the community once a week, 20% keeps the
                team building. Hold a boi, get paid.
              </p>

              {/* Legend / breakdown */}
              <div className="space-y-3 max-w-[420px]">
                <div className="flex items-center justify-between gap-4 pb-3 border-b border-[#2F2B28]/10">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 bg-[#A64C4F]" />
                    <span className="text-[14px] text-[#2F2B28] font-medium">
                      Community
                    </span>
                  </div>
                  <span className="text-[14px] font-mono text-[#2F2B28]">
                    80%
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 pb-3 border-b border-[#2F2B28]/10">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 bg-[#2F2B28]" />
                    <span className="text-[14px] text-[#826D62]">Team</span>
                  </div>
                  <span className="text-[14px] font-mono text-[#826D62]">
                    20%
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 pt-1">
                  <span className="text-[12px] font-mono text-[#BBB6BF] uppercase tracking-[0.1em]">
                    Distribution
                  </span>
                  <span className="text-[12px] font-mono text-[#A64C4F] uppercase tracking-[0.1em]">
                    Weekly
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Launchpad promo */}
          <div className="mt-[clamp(60px,8vw,110px)] pt-[clamp(40px,5vw,60px)] border-t border-[#2F2B28]/10">
            <p className="text-[12px] font-mono text-[#A64C4F] tracking-[0.15em] uppercase mb-5">
              And there's more
            </p>
            <h3 className="text-[clamp(34px,4.2vw,60px)] font-bold text-[#2F2B28] leading-[1.05] mb-8 max-w-[900px]">
              The launchpad that pays holders.
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-16 items-start">
              <p className="text-[clamp(15px,1.2vw,17px)] text-[#826D62] leading-[1.7] max-w-[540px]">
                Rug.World is our launchpad,and the first one where Royalty
                Share comes built in. Every collection that drops through us
                inherits the same system BOIS runs on. Their holders eat
                too. Same pipes, same weekly distribution, no extra setup.
                One launch, one crew fed for life.
              </p>

              {/* 50/50 split visual */}
              <div className="w-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-mono text-[#A64C4F] tracking-[0.1em] uppercase">
                    Bois holders
                  </span>
                  <span className="text-[11px] font-mono text-[#826D62] tracking-[0.1em] uppercase">
                    Team
                  </span>
                </div>
                <div className="flex h-16 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={inView ? { width: "50%" } : {}}
                    transition={{ duration: 0.9, ease: "easeOut", delay: 0.4 }}
                    className="bg-[#A64C4F] flex items-center justify-center"
                  >
                    <span className="text-[20px] font-bold text-[#EDE3BC]">
                      50%
                    </span>
                  </motion.div>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={inView ? { width: "50%" } : {}}
                    transition={{ duration: 0.9, ease: "easeOut", delay: 0.4 }}
                    className="bg-[#2F2B28] flex items-center justify-center"
                  >
                    <span className="text-[20px] font-bold text-[#EDE3BC]">
                      50%
                    </span>
                  </motion.div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[11px] text-[#BBB6BF] font-mono uppercase tracking-[0.1em]">
                    Launchpad revenue
                  </span>
                  <span className="text-[11px] text-[#A64C4F] font-mono uppercase tracking-[0.1em]">
                    Every launch
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

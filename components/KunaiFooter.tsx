"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import Link from "next/link";

const socials = [
  { label: "X (Twitter)", href: "#" },
  { label: "Discord", href: "#" },
  { label: "Telegram", href: "#" },
];

const pages = [
  { label: "Home", href: "/" },
  { label: "Dojo", href: "/dojo" },
  { label: "Process", href: "#process-container" },
  { label: "Features", href: "#service-section" },
];

const legal = [
  { label: "Terms & Conditions", href: "#" },
  { label: "Privacy Policy", href: "#" },
];

export default function KunaiFooter() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <footer ref={ref} className="footer-section">
      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.8 }}
      >
        {/* Main footer content */}
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-[500px]">
          {/* Left: Large logo */}
          <div className="flex items-end p-[clamp(24px,4vw,64px)]">
            <h2 className="font-serif text-[clamp(64px,8vw,120px)] text-white/90 tracking-wider">
              ZENSAI
            </h2>
          </div>

          {/* Right: Link columns with vertical divider */}
          <div className="border-l border-white/15 flex items-end p-[clamp(24px,4vw,64px)]">
            <div className="grid grid-cols-3 gap-8 w-full">
              {/* Social */}
              <div className="flex flex-col gap-3">
                {socials.map((link) => (
                  <a key={link.label} href={link.href} className="footer-link">
                    {link.label}
                  </a>
                ))}
              </div>

              {/* Pages */}
              <div className="flex flex-col gap-3">
                {pages.map((link) => (
                  <Link key={link.label} href={link.href} className="footer-link">
                    {link.label}
                  </Link>
                ))}
              </div>

              {/* Legal */}
              <div className="flex flex-col gap-3">
                {legal.map((link) => (
                  <a key={link.label} href={link.href} className="footer-link">
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/15">
          <div className="h-[1px] bg-white/10" />
          <div className="container-main py-4 flex items-center justify-between">
            <p className="text-[13px] text-white/40">
              Awakened AI Entities
            </p>
            <p className="text-[13px] text-white/40">
              &copy; 2026 Zensai. All rights reserved.
            </p>
          </div>
        </div>
      </motion.div>
    </footer>
  );
}

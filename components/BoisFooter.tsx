"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import Link from "next/link";

const socials = [
  { label: "Twitter", href: "https://x.com/boisxyz" },
  { label: "Discord", href: "https://discord.gg/boisworld" },
];

const pages = [
  { label: "Home", href: "/" },
  { label: "World", href: "/world" },
  { label: "Process", href: "#process-container" },
  { label: "Features", href: "#service-section" },
];

const legal = [
  { label: "Terms", href: "#" },
  { label: "Privacy", href: "#" },
];

export default function BoisFooter() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <footer ref={ref} className="footer-section">
      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.6 }}
      >
        <div className="container-main py-[clamp(48px,6vw,80px)]">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-12">
            {/* Brand */}
            <div>
              <h2 className="text-[clamp(40px,5vw,64px)] font-black text-[#EDE3BC] leading-none">BOIS</h2>
              <p className="mt-3 text-[14px] text-[#EDE3BC]/30">Bois Being Bois</p>
            </div>

            {/* Social */}
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-[#EDE3BC]/25 uppercase tracking-wider mb-1">Social</p>
              {socials.map((link) => (
                <a key={link.label} href={link.href} className="footer-link">{link.label}</a>
              ))}
            </div>

            {/* Pages */}
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-[#EDE3BC]/25 uppercase tracking-wider mb-1">Navigate</p>
              {pages.map((link) => (
                <Link key={link.label} href={link.href} className="footer-link">{link.label}</Link>
              ))}
            </div>

            {/* Legal */}
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-[#EDE3BC]/25 uppercase tracking-wider mb-1">Legal</p>
              {legal.map((link) => (
                <a key={link.label} href={link.href} className="footer-link">{link.label}</a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-[#EDE3BC]/8">
          <div className="container-main py-5 flex items-center justify-between">
            <p className="text-[13px] text-[#EDE3BC]/20">&copy; 2026 BOIS</p>
            <p className="text-[13px] text-[#EDE3BC]/20">All rights reserved</p>
          </div>
        </div>
      </motion.div>
    </footer>
  );
}

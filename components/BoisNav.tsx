"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const links = [
  { label: "Home", href: "/" },
  { label: "Process", href: "#process-container" },
  { label: "Features", href: "#service-section" },
  { label: "FAQ", href: "#faq-section" },
  { label: "Twitter", href: "https://x.com/boisxyz" },
  { label: "Discord", href: "https://discord.gg/boisworld" },
];

export default function BoisNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <motion.button
        className="nav-opener"
        onClick={() => setOpen(!open)}
        animate={{
          scale: open ? 0 : 1,
          opacity: scrolled ? 1 : 0.85,
        }}
        aria-label="Toggle navigation"
        style={{ pointerEvents: open ? "none" : "auto" }}
      >
        <div className="flex flex-col gap-[5px]">
          <span className="block w-[16px] h-[1.5px] bg-[#EDE3BC] rounded-full" />
          <span className="block w-[12px] h-[1.5px] bg-[#EDE3BC]/70 rounded-full" />
          <span className="block w-[16px] h-[1.5px] bg-[#EDE3BC] rounded-full" />
        </div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[300] bg-[#2F2B28] flex flex-col"
            initial={{ clipPath: "circle(0% at calc(100% - 52px) 48px)" }}
            animate={{ clipPath: "circle(150% at calc(100% - 52px) 48px)" }}
            exit={{ clipPath: "circle(0% at calc(100% - 52px) 48px)" }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-8 right-8 w-10 h-10 flex items-center justify-center text-[#EDE3BC]/50 hover:text-[#EDE3BC] transition-colors cursor-pointer"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="flex-1 flex flex-col items-start justify-center pl-[clamp(32px,8vw,80px)] gap-1">
              {links.map((link, i) => {
                const isRoute = link.href.startsWith("/") || link.href.startsWith("#");
                const Component = isRoute ? Link : "a";
                const extraProps = !isRoute ? { target: "_blank", rel: "noopener noreferrer" } : {};
                return (
                  <motion.div
                    key={link.label}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.05, duration: 0.3 }}
                  >
                    <Component
                      href={link.href}
                      {...extraProps}
                      onClick={() => setOpen(false)}
                      className="text-[clamp(28px,4vw,48px)] font-bold text-[#EDE3BC]/50 hover:text-[#EDE3BC] transition-colors py-1"
                    >
                      {link.label}
                    </Component>
                  </motion.div>
                );
              })}
            </div>

            <div className="pb-8 pl-[clamp(32px,8vw,80px)]">
              <p className="text-[13px] text-[#EDE3BC]/25">
                &copy; 2026 BOIS
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

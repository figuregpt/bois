"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const links = [
  { label: "Home", href: "/" },
  { label: "Process", href: "#process-container" },
  { label: "Features", href: "#service-section" },
  { label: "FAQ", href: "#faq-section" },
  { label: "Dojo", href: "/dojo" },
];

export default function KunaiNav() {
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
      {/* Nav opener — top right, larger with hamburger icon */}
      <motion.button
        className="nav-opener"
        onClick={() => setOpen(!open)}
        animate={{
          scale: open ? 0 : 1,
          opacity: scrolled ? 1 : 0.85,
        }}
        whileHover={{ scale: 1.1 }}
        aria-label="Toggle navigation"
        style={{ pointerEvents: open ? "none" : "auto" }}
      >
        {/* Hamburger lines */}
        <div className="flex flex-col gap-[5px]">
          <span className="block w-[16px] h-[1.5px] bg-white rounded-full" />
          <span className="block w-[12px] h-[1.5px] bg-white/70 rounded-full" />
          <span className="block w-[16px] h-[1.5px] bg-white rounded-full" />
        </div>
      </motion.button>

      {/* Full-screen nav overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[300] bg-red flex flex-col"
            initial={{ clipPath: "circle(0% at calc(100% - 52px) 48px)" }}
            animate={{ clipPath: "circle(150% at calc(100% - 52px) 48px)" }}
            exit={{ clipPath: "circle(0% at calc(100% - 52px) 48px)" }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-8 right-8 w-10 h-10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Nav links */}
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              {links.map((link, i) => {
                const isRoute = link.href.startsWith("/");
                const Component = isRoute ? Link : "a";
                return (
                  <motion.div
                    key={link.label}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.05, duration: 0.4 }}
                  >
                    <Component
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="text-[clamp(32px,5vw,56px)] font-bold text-white/60 hover:text-white transition-colors py-2 px-6"
                    >
                      {link.label}
                    </Component>
                  </motion.div>
                );
              })}
            </div>

            {/* Bottom */}
            <div className="pb-8 text-center">
              <p className="text-[13px] text-white/30">
                &copy; 2026 Zensai. All rights reserved.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

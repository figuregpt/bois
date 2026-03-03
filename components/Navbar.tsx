"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const leftLinks = [
  { label: "Home", href: "#home", soon: false },
  { label: "Collection", href: "#collection", soon: true },
  { label: "Lore", href: "#lore", soon: true },
];

const rightLinks = [
  { label: "Dojo", href: "/dojo", soon: false },
];

const allLinks = [...leftLinks, ...rightLinks];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const renderLink = (link: { label: string; href: string; soon: boolean }, className: string) => {
    const isRoute = link.href.startsWith("/");
    const Component = isRoute ? Link : "a";
    return (
      <Component key={link.label} href={link.soon ? "#" : link.href} className={`${className} ${link.soon ? "pointer-events-none" : ""} relative`}>
        {link.label}
        {link.soon && <span className="soon-badge">Soon</span>}
      </Component>
    );
  };

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-page/80 backdrop-blur-xl shadow-[0_1px_0_rgba(0,0,0,0.06)]"
            : "bg-transparent"
        }`}
      >
        <div className="container-main h-[72px] flex items-center justify-between">
          {/* Left links */}
          <div className="hidden md:flex items-center gap-1">
            {leftLinks.map((link) =>
              renderLink(link, "px-4 py-2 text-[13px] text-black/50 hover:text-black transition-colors duration-200")
            )}
          </div>

          {/* Center logo */}
          <Link href="#home" className="absolute left-1/2 -translate-x-1/2">
            <span className="text-black font-extrabold text-xl tracking-[-0.03em] uppercase">
              ZENSAI
            </span>
          </Link>

          {/* Right links + CTA */}
          <div className="hidden md:flex items-center gap-1 ml-auto">
            {rightLinks.map((link) =>
              renderLink(link, "px-4 py-2 text-[13px] text-black/50 hover:text-black transition-colors duration-200")
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden relative w-10 h-10 flex items-center justify-center ml-auto"
            aria-label="Toggle menu"
          >
            <div className="flex flex-col gap-1.5">
              <span className={`w-5 h-[1.5px] bg-black/70 transition-all duration-300 origin-center ${mobileOpen ? "rotate-45 translate-y-[3.5px]" : ""}`} />
              <span className={`w-5 h-[1.5px] bg-black/70 transition-all duration-300 ${mobileOpen ? "opacity-0 scale-0" : ""}`} />
              <span className={`w-5 h-[1.5px] bg-black/70 transition-all duration-300 origin-center ${mobileOpen ? "-rotate-45 -translate-y-[3.5px]" : ""}`} />
            </div>
          </button>
        </div>
      </motion.nav>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-page/95 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col items-center justify-center h-full gap-3">
              {allLinks.map((link, i) => {
                const isRoute = link.href.startsWith("/");
                const Component = isRoute ? Link : "a";
                return (
                  <motion.div
                    key={link.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                  >
                    <Component
                      href={link.soon ? "#" : link.href}
                      onClick={() => !link.soon && setMobileOpen(false)}
                      className={`text-2xl font-light text-black/50 hover:text-black transition-colors py-3 px-8 relative ${link.soon ? "pointer-events-none opacity-40" : ""}`}
                    >
                      {link.label}
                      {link.soon && <span className="soon-badge ml-2">Soon</span>}
                    </Component>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

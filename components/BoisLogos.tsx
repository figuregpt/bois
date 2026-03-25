"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const logos = [
  { src: "https://framerusercontent.com/images/HRX4Z0OK1WJgfEPX3O19tdRr1A.png?width=400&height=275", accent: false },
  { src: "https://framerusercontent.com/images/TnIJYQhjl07BIGEEcZm6LDcogY.png?width=400&height=178", accent: true },
  { src: "https://framerusercontent.com/images/yU3sggUjp3RUPp1Jtj3SxkLqXk.png?width=400&height=244", accent: false },
  { src: "https://framerusercontent.com/images/Nj2CwX2eFSswz2TS8hXjV6B4uM.png?width=400&height=100", accent: true },
  { src: "https://framerusercontent.com/images/fXdTKSpM9JCpN72hwv6KKLXxY.png?width=400&height=160", accent: false },
  { src: "https://framerusercontent.com/images/1ZXPHs5C96kpGZvh2WJB1GWVHYI.png?width=400&height=266", accent: true },
];

export default function BoisLogos() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="py-[clamp(40px,6vw,80px)]">
      <div className="container-main">
        <motion.div
          className="logo-grid"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6 }}
        >
          {logos.map((logo, i) => (
            <div
              key={i}
              className={`logo-grid-item ${logo.accent ? "logo-grid-item-gold" : ""}`}
            >
              <img
                src={logo.src}
                alt=""
                className="w-[55%] h-auto object-contain"
                style={{ opacity: logo.accent ? 1 : 0.4 }}
              />
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

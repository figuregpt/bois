"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const logos = [
  { src: "https://framerusercontent.com/images/HRX4Z0OK1WJgfEPX3O19tdRr1A.png?width=400&height=275", bg: "light" },
  { src: "https://framerusercontent.com/images/TnIJYQhjl07BIGEEcZm6LDcogY.png?width=400&height=178", bg: "red" },
  { src: "https://framerusercontent.com/images/yU3sggUjp3RUPp1Jtj3SxkLqXk.png?width=400&height=244", bg: "light" },
  { src: "https://framerusercontent.com/images/Nj2CwX2eFSswz2TS8hXjV6B4uM.png?width=400&height=100", bg: "red" },
  { src: "https://framerusercontent.com/images/fXdTKSpM9JCpN72hwv6KKLXxY.png?width=400&height=160", bg: "light" },
  { src: "https://framerusercontent.com/images/1ZXPHs5C96kpGZvh2WJB1GWVHYI.png?width=400&height=266", bg: "red" },
];

export default function KunaiLogos() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="py-[clamp(40px,6vw,80px)]">
      <div className="container-main">
        <motion.div
          className="logo-grid"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          {logos.map((logo, i) => (
            <div
              key={i}
              className={`logo-grid-item ${logo.bg === "red" ? "logo-grid-item-red" : "bg-page"}`}
            >
              <img
                src={logo.src}
                alt=""
                className="w-[60%] h-auto object-contain"
              />
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const VIDEOS = ["/videos/bois.mp4", "/videos/bois2.mp4", "/videos/bois3.mp4", "/videos/bois4.mp4"];

export default function BoisHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [minTimePassed, setMinTimePassed] = useState(false);
  const loaded = videoReady && minTimePassed;
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    setSrc(VIDEOS[Math.floor(Math.random() * VIDEOS.length)]);
    const timer = setTimeout(() => setMinTimePassed(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    v.load();
    v.play().catch(() => {});
  }, [src]);

  return (
    <section className="relative h-screen w-full overflow-hidden bg-[#2F2B28]">
      {/* Loading state: logo gif */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-[#2F2B28]">
          <img src="/logogolden.gif" alt="" className="w-[280px] h-[280px] object-contain" />
        </div>
      )}

      {src && (
        <video
          ref={videoRef}
          src={src}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onCanPlayThrough={() => setVideoReady(true)}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.6s ease" }}
        />
      )}

      {/* Simple dark overlay for readability */}
      <div className="absolute inset-0 bg-[#2F2B28]/50" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end z-10 p-[clamp(24px,5vw,64px)] pb-[clamp(48px,8vh,100px)]">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-[clamp(72px,15vw,180px)] font-black text-[#EDE3BC] leading-[0.85] tracking-[-0.03em]"
        >
          BOIS
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-4 text-[clamp(16px,1.8vw,24px)] text-[#EDE3BC]/60 max-w-[480px] leading-[1.4]"
        >
          A crew born from the streets. Every boi has a story,and a piece of yours.
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="mt-6 text-[13px] text-[#EDE3BC]/30 tracking-[0.2em] uppercase"
        >
          Bois Being Bois
        </motion.p>
      </div>
    </section>
  );
}

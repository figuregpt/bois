"use client";

import { useState, useEffect } from "react";

const gifs = ["/gif1.gif", "/gif2.gif", "/gif4.gif"];

export default function Splash() {
  const [src, setSrc] = useState("");

  useEffect(() => {
    setSrc(gifs[Math.floor(Math.random() * gifs.length)]);
  }, []);

  if (!src) return <div className="w-full h-screen bg-black" />;

  return (
    <div className="w-full h-screen relative overflow-hidden bg-black">
      <img
        src={src}
        alt=""
        className="w-full h-full object-cover"
      />
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";

const VIDEOS = ["/videos/bois.mp4", "/videos/bois2.mp4", "/videos/bois3.mp4", "/videos/bois4.mp4"];
const API_URL = typeof window !== "undefined" && window.location.hostname === "localhost"
  ? "http://localhost:4000"
  : "https://zensai-backend-production.up.railway.app";

const TOKEN_KEY = "site-auth-token";

export default function SiteGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);

  useEffect(() => {
    setVideoSrc(VIDEOS[Math.floor(Math.random() * VIDEOS.length)]);
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setChecking(false);
      return;
    }
    fetch(`${API_URL}/api/auth/status`, {
      headers: { "X-Auth-Token": token },
    })
      .then((r) => {
        if (r.ok) setAuthed(true);
        else localStorage.removeItem(TOKEN_KEY);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: input }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          localStorage.setItem(TOKEN_KEY, data.token);
          setAuthed(true);
        } else {
          setError(true);
          setTimeout(() => setError(false), 1500);
        }
      } else {
        setError(true);
        setTimeout(() => setError(false), 1500);
        setInput("");
      }
    } catch {
      setError(true);
      setTimeout(() => setError(false), 1500);
    }
    setLoading(false);
  };

  if (authed) return <>{children}</>;
  if (checking) {
    return (
      <div className="fixed inset-0 bg-[#2F2B28] flex items-center justify-center">
        <img src="/logogolden.gif" alt="" className="w-28 h-28 object-contain" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#2F2B28] overflow-hidden">
      {/* Background video */}
      {videoSrc && (
        <video
          src={videoSrc}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onCanPlayThrough={() => setVideoLoaded(true)}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: videoLoaded ? 0.3 : 0, transition: "opacity 1s ease" }}
        />
      )}

      {/* Logo top-left */}
      <div className="absolute top-8 left-8 z-10">
        <img src="/logogolden.gif" alt="" className="w-28 h-28 object-contain" />
      </div>

      {/* BOIS bottom-left */}
      <div className="absolute bottom-8 left-8 z-10">
        <h1 className="text-[clamp(48px,10vw,120px)] font-black text-[#EDE3BC] leading-[0.85] tracking-[-0.03em]">
          BOIS
        </h1>
      </div>

      {/* Password + X link */}
      <div className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 z-10 w-[360px] text-center">
        <p className="text-[13px] text-[#EDE3BC]/40 tracking-[0.15em] uppercase mb-6">Early Access</p>
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Password"
          autoFocus
          className={`w-full bg-[#EDE3BC]/5 border px-5 py-4 text-[16px] text-center outline-none transition-colors ${
            error
              ? "border-[#A64C4F] text-[#A64C4F] placeholder:text-[#A64C4F]/40"
              : "border-[#EDE3BC]/15 text-[#EDE3BC] placeholder:text-[#EDE3BC]/25 focus:border-[#EDE3BC]/40"
          }`}
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="mt-4 w-full py-3 text-[15px] font-semibold bg-[#EDE3BC] text-[#2F2B28] hover:opacity-90 transition-all cursor-pointer disabled:opacity-50"
        >
          {loading ? "..." : "Enter"}
        </button>
        {error && <p className="mt-3 text-[14px] text-[#A64C4F]">Wrong password</p>}
        <a
          href="https://x.com/boisxyz"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-8 px-5 py-2.5 text-[14px] text-[#EDE3BC]/50 hover:text-[#EDE3BC] border border-[#EDE3BC]/15 hover:border-[#EDE3BC]/40 transition-all"
        >
          Follow @boisxyz on X
        </a>
      </div>
    </div>
  );
}

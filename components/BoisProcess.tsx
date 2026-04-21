"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

const MAX = 200;
const STORAGE_KEY = "bois-wall-signatures-v3";
const THUMB_W = 120;
const THUMB_H = 120;

export default function BoisProcess() {
  const [signatures, setSignatures] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [wallSize, setWallSize] = useState<{ w: number; h: number } | null>(
    null
  );
  const [portrait, setPortrait] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const wallWrapRef = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const cols = portrait ? 10 : 20;
  const rows = portrait ? 20 : 10;

  useEffect(() => {
    const mq = window.matchMedia("(max-aspect-ratio: 1/1)");
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const el = wallWrapRef.current;
    if (!el) return;
    const aspect = (cols * THUMB_W) / (rows * THUMB_H);
    const compute = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      let w = width;
      let h = w / aspect;
      if (h > height) {
        h = height;
        w = h * aspect;
      }
      setWallSize({ w, h });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [cols, rows]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setSignatures(parsed.slice(0, MAX));
      }
    } catch {}
  }, []);

  const full = signatures.length >= MAX;

  const persist = (next: string[]) => {
    setSignatures(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  return (
    <section
      ref={ref}
      id="process-container"
      className="h-screen flex flex-col overflow-hidden py-6 sm:py-8"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
        className="container-main"
      >
        {/* Header */}
        <div className="border-b border-[#2F2B28]/10 mb-4 pb-3 flex items-end justify-between gap-4">
          <div>
            <span className="block text-[11px] font-mono text-[#A64C4F] mb-0.5">
              01
            </span>
            <span className="block text-[14px] sm:text-[15px] font-semibold text-[#2F2B28]">
              Leave a mark
            </span>
          </div>
          <span className="text-[11px] font-mono text-[#826D62]">
            {signatures.length.toString().padStart(3, "0")} / {MAX}
          </span>
        </div>

        {/* Title row + CTA */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-4">
          <div>
            <h3 className="text-[clamp(26px,3.2vw,44px)] font-bold text-[#2F2B28] leading-[1.05] mb-1">
              Leave a mark.
            </h3>
            <p className="text-[13px] sm:text-[14px] text-[#826D62] leading-[1.5] max-w-[520px]">
              Two hundred signatures. Draw yours,the streets only remember
              the first two hundred.
            </p>
          </div>
          <button
            onClick={() => !full && setModalOpen(true)}
            disabled={full}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-[#A64C4F] text-[#EDE3BC] text-[13px] font-medium hover:bg-[#2F2B28] transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            {full ? "Wall is full" : "Sign the wall →"}
          </button>
        </div>
      </motion.div>

      {/* Wall,full viewport width, fills remaining height */}
      <div
        ref={wallWrapRef}
        className="flex-1 min-h-0 flex items-center justify-center px-[clamp(16px,4vw,32px)] pb-4"
      >
        {wallSize && (
          <div
            className="border-t border-l border-[#2F2B28]/15 bg-[#2F2B28]/[0.02]"
            style={{ width: wallSize.w, height: wallSize.h }}
          >
            <div
              className="h-full w-full grid"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: MAX }).map((_, i) => {
                const sig = signatures[i];
                return (
                  <div
                    key={i}
                    className="flex items-center justify-center overflow-hidden border-r border-b border-[#2F2B28]/15 min-w-0 min-h-0"
                  >
                    {sig ? (
                      <img
                        src={sig}
                        alt=""
                        className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        draggable={false}
                        onClick={() => setZoomed(sig)}
                      />
                    ) : (
                      <span className="w-[3px] h-[3px] bg-[#2F2B28]/15 rounded-full" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <SignModal
          onClose={() => setModalOpen(false)}
          onSave={(dataUrl) => {
            persist([...signatures, dataUrl]);
            setModalOpen(false);
          }}
        />
      )}

      {zoomed && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#2F2B28]/85 p-8 cursor-zoom-out"
          onClick={() => setZoomed(null)}
        >
          <motion.img
            src={zoomed}
            alt=""
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            className="max-w-[80vw] max-h-[80vh] border border-[#EDE3BC]/20 bg-[#EDE3BC]"
            style={{ imageRendering: "pixelated" }}
            draggable={false}
          />
        </div>
      )}
    </section>
  );
}

function SignModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasStroke, setHasStroke] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#EDE3BC";
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pointFromEvent(e);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const p = pointFromEvent(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.strokeStyle = "#2F2B28";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasStroke) setHasStroke(true);
  };

  const onUp = () => {
    drawing.current = false;
    last.current = null;
  };

  const clear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#EDE3BC";
    ctx.fillRect(0, 0, c.width, c.height);
    setHasStroke(false);
  };

  const save = () => {
    if (!hasStroke) return;
    const src = canvasRef.current!;
    const off = document.createElement("canvas");
    off.width = THUMB_W;
    off.height = THUMB_H;
    const octx = off.getContext("2d")!;
    octx.fillStyle = "#EDE3BC";
    octx.fillRect(0, 0, off.width, off.height);
    octx.drawImage(src, 0, 0, off.width, off.height);
    onSave(off.toDataURL("image/png"));
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#2F2B28]/80 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#EDE3BC] border border-[#2F2B28]/20 p-6 w-full max-w-[560px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[11px] font-mono text-[#A64C4F] tracking-[0.1em] uppercase mb-1">
              Sign the wall
            </p>
            <h4 className="text-[22px] font-bold text-[#2F2B28] leading-tight">
              Draw your mark.
            </h4>
          </div>
          <button
            onClick={onClose}
            className="text-[#826D62] hover:text-[#2F2B28] text-[20px] leading-none cursor-pointer"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="border border-[#2F2B28]/20 bg-[#EDE3BC] mb-4">
          <canvas
            ref={canvasRef}
            width={360}
            height={360}
            className="w-full aspect-square touch-none cursor-crosshair block"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={onUp}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={clear}
            className="text-[13px] text-[#826D62] hover:text-[#2F2B28] font-mono uppercase tracking-[0.1em] cursor-pointer"
          >
            Clear
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-[13px] text-[#2F2B28] border border-[#2F2B28]/20 hover:border-[#2F2B28]/50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!hasStroke}
              className="px-5 py-2.5 text-[13px] bg-[#A64C4F] text-[#EDE3BC] hover:bg-[#2F2B28] transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              Save to wall
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

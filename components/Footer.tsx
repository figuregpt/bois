"use client";

export default function Footer() {
  return (
    <footer className="bg-[#e0e0e0] py-16">
      <div className="container-main">
        <div className="grid sm:grid-cols-3 gap-10 mb-12">
          {/* Sections */}
          <div>
            <h4 className="text-sm font-semibold text-black mb-4">Sections</h4>
            <div className="flex flex-col gap-2">
              <a href="#home" className="text-sm text-black/40 hover:text-black/70 transition-colors">Home</a>
              <a href="#collection" className="text-sm text-black/40 hover:text-black/70 transition-colors">Collection</a>
              <a href="#lore" className="text-sm text-black/40 hover:text-black/70 transition-colors">Lore</a>
              <a href="#network" className="text-sm text-black/40 hover:text-black/70 transition-colors">Network</a>
            </div>
          </div>
          {/* Resources */}
          <div>
            <h4 className="text-sm font-semibold text-black mb-4">Resources</h4>
            <div className="flex flex-col gap-2">
              <a href="#" className="text-sm text-black/40 hover:text-black/70 transition-colors">Docs</a>
              <a href="/dojo" className="text-sm text-black/40 hover:text-black/70 transition-colors">Dojo</a>
              <a href="#leaderboard" className="text-sm text-black/40 hover:text-black/70 transition-colors">Leaderboard</a>
            </div>
          </div>
          {/* Community */}
          <div>
            <h4 className="text-sm font-semibold text-black mb-4">Community</h4>
            <div className="flex flex-col gap-2">
              <a href="#" className="text-sm text-black/40 hover:text-black/70 transition-colors">X (Twitter)</a>
              <a href="#" className="text-sm text-black/40 hover:text-black/70 transition-colors">Discord</a>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-8 border-t border-black/[0.06]">
          <span className="text-black font-extrabold text-lg tracking-[-0.03em] uppercase">ZENSAI</span>
          <div className="flex items-center gap-4 mt-4 sm:mt-0">
            {/* Social icons */}
            {["X", "in", "f", "ig"].map((icon) => (
              <a
                key={icon}
                href="#"
                className="w-9 h-9 rounded-full border border-black/10 flex items-center justify-center text-xs text-black/40 hover:text-black/70 hover:border-black/20 transition-colors"
              >
                {icon}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

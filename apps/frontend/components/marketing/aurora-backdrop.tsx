/**
 * Ambient brand backdrop: two slow aurora blooms over a faded blueprint
 * grid. Purely decorative and always behind content.
 */
export function AuroraBackdrop({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-0 grid-bg grid-fade opacity-70" />
      <div
        className="animate-aurora absolute -top-[28%] left-1/2 h-[720px] w-[1100px] -translate-x-1/2 rounded-full blur-[110px]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--primary) 42%, transparent), transparent 72%)",
        }}
      />
      <div
        className="animate-aurora absolute -top-[12%] right-[4%] h-[460px] w-[620px] rounded-full blur-[100px] [animation-delay:-8s]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--accent) 30%, transparent), transparent 70%)",
        }}
      />
      <div
        className="animate-aurora absolute -bottom-[26%] left-[6%] h-[520px] w-[680px] rounded-full blur-[110px] [animation-delay:-15s]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--violet) 30%, transparent), transparent 72%)",
        }}
      />
      {/* Fade the whole field into the page so no seam is visible. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
    </div>
  );
}

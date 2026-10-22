/** A ring that spins. Under "reduce motion" it pulses instead of rotating. */
export function Spinner({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="inline-block shrink-0 rounded-full border-[3px] border-primary-tint border-t-primary motion-safe:animate-spin motion-reduce:animate-pulse"
    />
  );
}

/** Fills the page area while a whole page loads. */
export function CenteredLoader({ label = "Memuat…" }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-[60dvh] flex-1 flex-col items-center justify-center gap-4">
      <Spinner size={40} />
      <p className="text-small text-muted">{label}</p>
    </div>
  );
}

/** A small spinner with a label, for a single block (like the greeting) that streams in. */
export function InlineLoader({ label = "Memuat…" }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-16 items-center gap-3">
      <Spinner size={24} />
      <p className="text-small text-muted">{label}</p>
    </div>
  );
}

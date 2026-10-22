import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover border border-transparent",
  secondary: "bg-surface text-ink border border-border hover:bg-primary-tint",
  ghost: "bg-transparent text-primary border border-transparent hover:bg-primary-tint",
  danger: "bg-danger text-white border border-transparent hover:opacity-90",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  full?: boolean;
}

export function Button({ variant = "primary", loading = false, full = false, className = "", children, disabled, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-body font-semibold transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${full ? "w-full" : ""} ${className}`}
    >
      {loading && <Loader2 size={20} strokeWidth={1.75} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      {children}
    </button>
  );
}

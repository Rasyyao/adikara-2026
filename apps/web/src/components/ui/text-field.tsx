"use client";

import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string;
  hint?: string;
}

/** Labelled input with a linked error/hint. `type="password"` gets a show/hide toggle and a Caps Lock warning. */
export const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { label, error, hint, type = "text", className = "", onKeyUp, onKeyDown, onBlur, ...rest },
  ref,
) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const isPassword = type === "password";
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const describedBy = [hint && !error ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-small font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          {...rest}
          ref={ref}
          id={id}
          type={isPassword && visible ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          // Stop the browser and keyboards from "fixing" what people type in credential fields.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onKeyUp={(event) => {
            if (isPassword) setCapsLock(event.getModifierState("CapsLock"));
            onKeyUp?.(event);
          }}
          onKeyDown={(event) => {
            if (isPassword) setCapsLock(event.getModifierState("CapsLock"));
            onKeyDown?.(event);
          }}
          onBlur={(event) => {
            setCapsLock(false);
            onBlur?.(event);
          }}
          className={`block min-h-12 w-full rounded-md border bg-surface px-4 text-body text-ink placeholder:text-muted transition-colors duration-150 ease-out ${
            isPassword ? "pr-12" : ""
          } ${error ? "border-danger" : "border-border hover:border-muted"} ${className}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-muted transition-colors duration-150 ease-out hover:text-ink"
          >
            {visible ? <EyeOff size={20} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={20} strokeWidth={1.75} aria-hidden="true" />}
          </button>
        )}
      </div>
      {capsLock && (
        <p className="mt-1 text-small text-warning" role="status">
          Caps Lock sedang aktif.
        </p>
      )}
      {error ? (
        <p id={errorId} className="mt-1 flex items-start gap-1 text-small text-danger">
          <AlertCircle size={20} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1 text-small text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

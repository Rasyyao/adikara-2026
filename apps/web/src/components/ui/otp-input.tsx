"use client";

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Label for the whole group, for screen readers. */
  label: string;
  length?: number;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
  onBlur?: () => void;
}

/**
 * One box per digit. Typing moves forward, Backspace moves back, arrows move around, and pasting
 * (or the phone's SMS autofill) fills all boxes at once. The value is always digits only, no gaps.
 */
export function OtpInput({ value, onChange, label, length = 6, invalid, disabled, autoFocus, describedBy, onBlur }: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  // The newest value, updated the moment we change it. State only updates after this event ends, so
  // reading `value` right after onChange() would see the old digits and bounce focus back.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const focusBox = (index: number) => refs.current[Math.max(0, Math.min(index, length - 1))]?.focus();

  /** Puts `digits` into the value starting at `index`, then moves focus after the last digit. */
  function insert(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    const current = latest.current;
    const next = (current.slice(0, index) + digits + current.slice(index + digits.length)).slice(0, length);
    latest.current = next;
    onChange(next);
    focusBox(Math.min(index + digits.length, length - 1));
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const current = latest.current;
      if (current[index]) {
        latest.current = current.slice(0, index) + current.slice(index + 1);
        onChange(latest.current);
      } else if (index > 0) {
        latest.current = current.slice(0, index - 1) + current.slice(index);
        onChange(latest.current);
        focusBox(index - 1);
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
    }
  }

  function onPaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    insert(index, event.clipboardData.getData("text"));
  }

  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="flex justify-center gap-2 sm:gap-3">
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(element) => {
            refs.current[index] = element;
          }}
          value={value[index] ?? ""}
          onChange={(event) => insert(index, event.target.value)}
          onKeyDown={(event) => onKeyDown(index, event)}
          onPaste={(event) => onPaste(index, event)}
          onFocus={(event) => {
            // Boxes fill in order: a click on a later box goes to the first empty one.
            if (index > latest.current.length) focusBox(latest.current.length);
            else event.target.select();
          }}
          onBlur={onBlur}
          inputMode="numeric"
          pattern="\d*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={length} // lets a pasted or autofilled code arrive whole; insert() splits it
          autoFocus={autoFocus && index === 0}
          disabled={disabled}
          aria-label={`Digit ${index + 1} dari ${length}`}
          aria-invalid={invalid || undefined}
          className={`h-14 w-11 rounded-md border bg-surface text-center font-mono text-h1 font-medium text-ink transition-colors duration-150 ease-out sm:h-16 sm:w-13 ${
            invalid ? "border-danger" : value[index] ? "border-primary" : "border-border hover:border-muted"
          }`}
        />
      ))}
    </div>
  );
}

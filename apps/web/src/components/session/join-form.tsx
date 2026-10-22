"use client";

import { useActionState, useEffect, useState, startTransition } from "react";
import { joinSessionAction, type FormState } from "@/app/actions/sessions";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/ui/otp-input";
import { useToast } from "@/components/ui/toast";
import { validatePin } from "@/lib/validation/auth";

const initial: FormState = {};

export function JoinForm() {
  const toast = useToast();
  const [state, formAction, pending] = useActionState(joinSessionAction, initial);
  const [code, setCode] = useState("");
  const [rejected, setRejected] = useState(false); // red boxes, set only after a failed submit

  // Answers from the server (wrong PIN, locked session...) arrive as a toast.
  useEffect(() => {
    const message = state.message ?? state.fieldErrors?.code;
    if (message) toast.error({ title: "Tidak bisa masuk sesi", message });
  }, [state, toast]);

  function submit(value: string) {
    const problem = validatePin(value);
    if (problem) {
      // Nothing is said while the PIN is still being typed. Only pressing the button shows this.
      setRejected(true);
      toast.error({ title: "PIN belum lengkap", message: "PIN terdiri dari 6 angka. Lengkapi dulu, lalu coba lagi." });
      return;
    }
    const data = new FormData();
    data.set("code", value);
    startTransition(() => formAction(data));
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(code);
      }}
      noValidate
      className="flex flex-col gap-6"
    >
      <OtpInput
        value={code}
        label="PIN sesi, 6 angka"
        invalid={rejected}
        disabled={pending}
        autoFocus
        onChange={(next) => {
          setCode(next);
          setRejected(false);
          if (next.length === 6) submit(next); // PIN is complete: no extra tap needed
        }}
      />
      <Button type="submit" full loading={pending}>
        {pending ? "Masuk…" : "Masuk ke sesi"}
      </Button>
    </form>
  );
}

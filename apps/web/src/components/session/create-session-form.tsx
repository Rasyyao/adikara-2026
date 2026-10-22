"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { createSessionAction, type FormState } from "@/app/actions/sessions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ClassView } from "@/lib/api/types";

const initial: FormState = {};

export function CreateSessionForm({ classes }: { classes: ClassView[] }) {
  const [state, formAction, pending] = useActionState(createSessionAction, initial);
  const [classCode, setClassCode] = useState(classes.length === 1 ? classes[0].class_code : "");
  const toast = useToast();
  const id = useId();
  const errorId = `${id}-error`;
  const error = state.fieldErrors?.classCode;

  useEffect(() => {
    if (!state.message) return;
    toast.error({
      title: "Sesi belum dibuat",
      message: state.message,
      action: state.existingSessionId ? { label: "Lanjutkan sesi tersebut", href: `/teacher/sessions/${state.existingSessionId}` } : undefined,
    });
  }, [state, toast]);

  if (classes.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-body text-muted">
        Anda belum mengajar kelas apa pun. Minta admin sekolah menugaskan kelas ke akun Anda.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor={id} className="mb-1 block text-small font-semibold">
          Kelas
        </label>
        <select
          id={id}
          name="class_code"
          value={classCode}
          onChange={(event) => setClassCode(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          required
          className={`block min-h-12 w-full rounded-md border bg-surface px-4 text-body text-ink ${error ? "border-danger" : "border-border"}`}
        >
          <option value="" disabled>
            Pilih kelas…
          </option>
          {classes.map((item) => (
            <option key={item.id} value={item.class_code}>
              {item.name} · {item.student_count} siswa
            </option>
          ))}
        </select>
        {error && (
          <p id={errorId} className="mt-1 text-small text-danger">
            {error}
          </p>
        )}
      </div>

      <Button type="submit" loading={pending}>
        {pending ? "Membuat sesi…" : "Buat sesi dan dapatkan PIN"}
      </Button>
    </form>
  );
}

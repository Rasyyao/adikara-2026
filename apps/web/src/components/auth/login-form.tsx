"use client";

import { GraduationCap, UserRound } from "lucide-react";
import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { validateLogin, type FieldErrors, type LoginRole } from "@/lib/validation/auth";

const ROLES: Array<{ value: LoginRole; label: string; Icon: typeof UserRound }> = [
  { value: "teacher", label: "Guru", Icon: GraduationCap },
  { value: "student", label: "Siswa", Icon: UserRound },
];

const COPY = {
  teacher: {
    field: "email" as const,
    label: "Email",
    placeholder: "nama@sekolah.sch.id",
    autoComplete: "username",
    inputMode: "email" as const,
    type: "email",
  },
  student: {
    field: "username" as const,
    label: "Nama pengguna",
    placeholder: "contoh: rani.putri",
    autoComplete: "username",
    inputMode: "text" as const,
    type: "text",
  },
};

const initial: LoginState = {};

export function LoginForm() {
  const [role, setRole] = useState<LoginRole>("teacher");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  // Field errors stay hidden until "Masuk" has been pressed once; after that they follow what is typed.
  const [submitted, setSubmitted] = useState(false);
  const [state, formAction, pending] = useActionState(loginAction, initial);

  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const copy = COPY[role];

  // Nobody is scolded while still typing: nothing shows before the first press of "Masuk".
  const live = validateLogin(role, identifier, password);
  const serverErrors = state.fieldErrors ?? {};
  const errors: FieldErrors = {
    [copy.field]: (submitted ? live[copy.field] : undefined) ?? serverErrors[copy.field],
    password: (submitted ? live.password : undefined) ?? serverErrors.password,
  };

  // A server problem pops up as a toast; a bad field gets focus so keyboard and screen-reader users land there.
  useEffect(() => {
    if (state.message) toast.error({ title: "Gagal masuk", message: state.message });
    else if (state.fieldErrors?.[copy.field]) identifierRef.current?.focus();
    else if (state.fieldErrors?.password) passwordRef.current?.focus();
  }, [state, copy.field, toast]);

  // Adikara does not use a Service Worker. If another app previously ran on localhost:3000 and left one behind,
  // unregister it so it cannot intercept requests or break hydration.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) void registration.unregister();
      });
    }
  }, []);

  function switchRole(next: LoginRole) {
    if (next === role) return;
    setRole(next);
    setIdentifier("");
    setSubmitted(false);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); // handled here so the typed values stay in the form after an error
    const found = validateLogin(role, identifier, password);
    if (Object.keys(found).length > 0) {
      setSubmitted(true);
      if (found[copy.field]) identifierRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 font-semibold">Masuk ke Adikara</h1>
        <p className="mt-1 text-body text-muted">Pilih peran Anda, lalu masukkan akun dari sekolah.</p>
      </div>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1 text-small font-semibold text-ink">Masuk sebagai</legend>
        <div className="relative grid grid-cols-2 rounded-md border border-border bg-bg p-1">
          <span
            aria-hidden="true"
            className="toggle__thumb absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-sm border border-border bg-surface"
            style={{ transform: role === "teacher" ? "translateX(0)" : "translateX(100%)" }}
          />
          {ROLES.map(({ value, label, Icon }) => (
            <label
              key={value}
              data-active={role === value}
              className={`toggle__option relative z-10 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-sm text-body font-semibold transition-colors duration-200 ease-out has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
                role === value ? "text-primary" : "text-muted hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name="role"
                value={value}
                checked={role === value}
                onChange={() => switchRole(value)}
                className="sr-only"
              />
              <Icon size={20} strokeWidth={1.75} className="toggle__icon" aria-hidden="true" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-4">
        <TextField
          key={role} // a fresh field per role, so the browser does not carry an email into the username box
          ref={identifierRef}
          label={copy.label}
          name={copy.field}
          type={copy.type}
          inputMode={copy.inputMode}
          autoComplete={copy.autoComplete}
          placeholder={copy.placeholder}
          maxLength={254}
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          error={errors[copy.field]}
          required
        />
        <TextField
          ref={passwordRef}
          label="Kata sandi"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={72}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          required
        />
      </div>

      <div className="flex flex-col gap-3">
        <Button type="submit" full loading={pending}>
          {pending ? "Memeriksa…" : "Masuk"}
        </Button>
        <p className="text-small text-muted">
          Belum punya akun atau lupa kata sandi? Akun dibuat oleh admin sekolah, jadi hubungi admin Anda.
        </p>
      </div>
    </form>
  );
}

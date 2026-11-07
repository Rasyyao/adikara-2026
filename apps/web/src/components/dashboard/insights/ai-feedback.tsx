"use client";

import { AlertTriangle, BookOpenCheck, Brain, HelpCircle, ListChecks, RefreshCw, Sparkles, UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getClassFeedbackAction, requestClassFeedbackAction } from "@/app/actions/insights";
import { Button } from "@/components/ui/button";
import type { ClassReport, ReportFeedback } from "@/lib/api/types";
import { InsightCard, dateTime } from "./insight-panels";

const POLL_MS = 3000;

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="flex items-center gap-2 text-small font-semibold text-ink">
        <span className="text-primary">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Feedback({ feedback }: { feedback: ReportFeedback }) {
  return (
    <div className="flex flex-col gap-6 px-5 py-5 sm:px-6">
      <p className="rounded-lg border border-primary/20 bg-primary-tint/50 px-4 py-3 text-body leading-relaxed text-ink">{feedback.summary}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        {feedback.focus_topics.length > 0 && (
          <Block icon={<BookOpenCheck size={17} strokeWidth={2} aria-hidden="true" />} title="Topik yang perlu diulang">
            <ul className="flex flex-col gap-2">
              {feedback.focus_topics.map((t) => (
                <li key={t.topic} className="rounded-lg border border-border/70 bg-bg/50 px-3.5 py-3">
                  <p className="text-small font-semibold text-ink">{t.topic}</p>
                  {t.finding && <p className="mt-1 text-small text-muted">{t.finding}</p>}
                  {t.suggestion && (
                    <p className="mt-2 text-small text-ink">
                      <span className="font-semibold text-primary">Saran: </span>
                      {t.suggestion}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Block>
        )}

        {feedback.questions.length > 0 && (
          <Block icon={<HelpCircle size={17} strokeWidth={2} aria-hidden="true" />} title="Soal yang paling banyak salah & miskonsepsinya">
            <ul className="flex flex-col gap-2">
              {feedback.questions.map((q) => (
                <li key={q.question} className="rounded-lg border border-border/70 bg-bg/50 px-3.5 py-3">
                  <p className="text-small font-semibold text-ink">{q.question}</p>
                  {q.misconception && (
                    <p className="mt-1.5 flex gap-1.5 text-small text-ink">
                      <AlertTriangle size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                      <span>{q.misconception}</span>
                    </p>
                  )}
                  {q.suggestion && (
                    <p className="mt-2 text-small text-ink">
                      <span className="font-semibold text-primary">Saran: </span>
                      {q.suggestion}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Block>
        )}

        {feedback.students.length > 0 && (
          <Block icon={<UserRound size={17} strokeWidth={2} aria-hidden="true" />} title="Siswa yang perlu didampingi">
            <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/70">
              {feedback.students.map((s) => (
                <li key={s.name} className="px-3.5 py-2.5">
                  <p className="text-small font-semibold text-ink">{s.name}</p>
                  {s.reason && <p className="text-small text-muted">{s.reason}</p>}
                  {s.action && <p className="mt-1 text-small text-ink">→ {s.action}</p>}
                </li>
              ))}
            </ul>
          </Block>
        )}

        {feedback.next_steps.length > 0 && (
          <Block icon={<ListChecks size={17} strokeWidth={2} aria-hidden="true" />} title="Langkah untuk pertemuan berikutnya">
            <ol className="flex flex-col gap-2">
              {feedback.next_steps.map((step, i) => (
                <li key={step} className="flex gap-2.5 text-small text-ink">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-caption font-bold text-white">{i + 1}</span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </Block>
        )}
      </div>
    </div>
  );
}

/**
 * The AI's reading of the class's results: where most students fail, the likely misconception behind it, and what to do
 * next. Asking queues a report; while it is pending the panel polls until the worker has written it.
 */
export function AiFeedback({ classId, initial, hasResults }: { classId: string; initial: ClassReport | null; hasResults: boolean }) {
  const [report, setReport] = useState<ClassReport | null>(initial);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = report?.status === "pending";

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(async () => {
      const result = await getClassFeedbackAction(classId);
      if (result.ok && result.data && result.data.status !== "pending") setReport(result.data);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, classId]);

  const ask = async () => {
    setAsking(true);
    setError(null);
    const result = await requestClassFeedbackAction(classId);
    setAsking(false);
    if (!result.ok) return setError(result.message);
    setReport(result.data);
  };

  const action = hasResults && !pending && (
    <Button variant={report ? "secondary" : "primary"} onClick={ask} loading={asking} className="shrink-0">
      {report ? <RefreshCw size={17} strokeWidth={1.85} aria-hidden="true" /> : <Sparkles size={17} strokeWidth={1.85} aria-hidden="true" />}
      {report ? "Analisis ulang" : "Buat analisis AI"}
    </Button>
  );

  return (
    <InsightCard
      title="Analisis & Umpan Balik AI"
      hint={
        report?.status === "done" && report.finished_at
          ? `Dibuat ${dateTime(report.finished_at)} dari hasil kuis dan kehadiran kelas saat itu.`
          : "AI membaca hasil kuis, soal yang paling banyak salah, dan kehadiran, lalu menyarankan apa yang perlu diulang."
      }
      icon={<Brain size={18} strokeWidth={2} aria-hidden="true" />}
      action={action}
    >
      {error && (
        <p role="alert" className="mx-5 mt-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-small text-danger sm:mx-6">
          {error}
        </p>
      )}
      <div aria-live="polite">
        {pending ? (
          <div className="flex items-center gap-3 px-5 py-8 sm:px-6">
            <span className="size-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden="true" />
            <p className="text-small text-ink">AI sedang menganalisis hasil kelas… Biasanya kurang dari satu menit.</p>
          </div>
        ) : report?.status === "done" && report.feedback ? (
          <Feedback feedback={report.feedback} />
        ) : report?.status === "failed" ? (
          <p className="mx-5 my-5 rounded-md border border-danger/30 bg-danger/5 px-3 py-2.5 text-small text-ink sm:mx-6">
            {report.error ?? "Analisis gagal dibuat."} Tekan &ldquo;Analisis ulang&rdquo; untuk mencoba lagi.
          </p>
        ) : (
          <p className="px-5 py-8 text-center text-small text-muted sm:px-6">
            {hasResults
              ? "Belum ada analisis. Tekan “Buat analisis AI” untuk melihat di mana siswa paling banyak gagal dan apa yang sebaiknya dilakukan."
              : "Analisis tersedia setelah ada kuis yang dikumpulkan siswa di kelas ini."}
          </p>
        )}
      </div>
    </InsightCard>
  );
}

import { notFound } from "next/navigation";
import { QuizRunner } from "@/components/session/quiz/quiz-runner";
import { requireViewer } from "@/lib/auth/dal";
import { isUuid } from "@/lib/validation/auth";

export const metadata = { title: "Kuis" };

/** A quiz on its own page: where the QR code on the board leads (`?from=qr`), on the student's phone or laptop. */
export default async function StudentQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; quizId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id, quizId }, { from }] = await Promise.all([params, searchParams]);
  if (!isUuid(id) || !isUuid(quizId)) notFound();
  await requireViewer("student");
  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <QuizRunner sessionId={id} quizId={quizId} entry={from === "qr" ? "qr" : "link"} backHref={`/student/sessions/${id}`} />
    </div>
  );
}

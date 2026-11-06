import { GenerationPanel } from "@/components/problems/generation-panel";
import { ProblemEditor } from "@/components/problems/problem-editor";
import { problemsApi } from "@/lib/api/endpoints";
import { requireViewer } from "@/lib/auth/dal";
import { loadProblem } from "@/lib/problems";

export const metadata = { title: "Ubah soal" };

export default async function ProblemEditorPage({ params }: PageProps<"/teacher/problems/[id]">) {
  const { id } = await params;
  const problem = await loadProblem(id);
  if (problem.generation) return <GenerationPanel key={`${problem.id}:${problem.generation}`} problem={problem} />;
  const { token } = await requireViewer("staff");
  const materials = await problemsApi.materials(token).then((r) => r.items).catch(() => []);
  // keyed by the last change, so a fresh AI draft replaces what the editor held
  return <ProblemEditor key={`${problem.id}:${problem.updated_at}`} problem={problem} materials={materials} />;
}

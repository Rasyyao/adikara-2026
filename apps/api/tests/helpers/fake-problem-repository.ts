import { randomUUID } from "node:crypto";
import type { ChatMaterialRow, ChatRow } from "../../src/types/teacher/chat.types.js";
import type { ProblemRecord, ProblemSource, TeacherProblemRepository } from "../../src/types/teacher/problem.types.js";

export interface ProblemJob {
  type: "GENERATE_PROBLEM";
  payload: { problemId: string; chatId: string; focus?: string };
  status: "QUEUED";
}

/**
 * In-memory block problems over the fake chats and materials. Generation jobs land in `jobs` (the worker is not
 * simulated; a test plays it with `finish`). Each write moves the clock one millisecond, so "newest change first" is stable.
 */
export function createFakeProblemRepository(
  chats: Map<string, ChatRow>,
  materials: Map<string, ChatMaterialRow & { chatId: string }>,
  jobs: ProblemJob[] = [],
): TeacherProblemRepository & { jobs: ProblemJob[]; rows: Map<string, ProblemRecord> } {
  const rows = new Map<string, ProblemRecord>();
  let clock = Date.UTC(2026, 10, 1);
  const tick = () => new Date((clock += 1));
  const copy = (r: ProblemRecord): ProblemRecord => ({ ...r, chatTitle: r.chatId ? (chats.get(r.chatId)?.title ?? null) : null, challenge: structuredClone(r.challenge) });
  const source = (chat: ChatRow): ProblemSource => {
    const files = [...materials.values()].filter((m) => m.chatId === chat.id);
    return {
      chatId: chat.id,
      teacherId: chat.teacherId,
      title: chat.title,
      readyFiles: files.filter((m) => m.status === "EXTRACTED").length,
      pendingFiles: files.filter((m) => m.status === "UPLOADED").length,
      problems: [...rows.values()].filter((r) => r.chatId === chat.id).length,
    };
  };
  const insert = (data: Pick<ProblemRecord, "teacherId" | "chatId" | "title" | "story" | "challenge"> & Partial<ProblemRecord>) => {
    const now = tick();
    const row: ProblemRecord = { id: randomUUID(), status: "draft", origin: "manual", aiFocus: null, generation: null, generationError: null, chatTitle: null, createdAt: now, updatedAt: now, ...data, challenge: structuredClone(data.challenge) };
    rows.set(row.id, row);
    return row;
  };

  return {
    jobs,
    rows,
    async list(teacherId, chatId) {
      return [...rows.values()]
        .filter((r) => (!teacherId || r.teacherId === teacherId) && (chatId === undefined || r.chatId === chatId))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map(copy);
    },
    async find(id) {
      const row = rows.get(id);
      return row ? copy(row) : null;
    },
    async create(input) {
      return copy(insert(input));
    },
    async update(id, changes) {
      const row = rows.get(id);
      if (!row) throw new Error("not found");
      const next: ProblemRecord = {
        ...row,
        ...changes,
        ...(changes.generation === null ? { generationError: null } : {}),
        challenge: changes.challenge ? structuredClone(changes.challenge) : row.challenge,
        updatedAt: tick(),
      };
      rows.set(id, next);
      return copy(next);
    },
    async remove(id) {
      rows.delete(id);
      jobs.splice(0, jobs.length, ...jobs.filter((j) => j.payload.problemId !== id));
    },
    async sources(teacherId) {
      return [...chats.values()].filter((c) => !teacherId || c.teacherId === teacherId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(source);
    },
    async findSource(chatId) {
      const chat = chats.get(chatId);
      return chat ? source(chat) : null;
    },
    async createGenerating({ teacherId, chatId, title, focus, challenge, count }) {
      return Array.from({ length: count }, () => {
        const row = insert({ teacherId, chatId, title, story: "", challenge, origin: "ai", aiFocus: focus, generation: "pending" });
        jobs.push({ type: "GENERATE_PROBLEM", payload: { problemId: row.id, chatId, ...(focus ? { focus } : {}) }, status: "QUEUED" });
        return copy(row);
      });
    },
    async regenerate(id, focus) {
      const row = rows.get(id)!;
      const next: ProblemRecord = { ...row, generation: "pending", generationError: null, aiFocus: focus, status: "draft", updatedAt: tick() };
      rows.set(id, next);
      jobs.push({ type: "GENERATE_PROBLEM", payload: { problemId: id, chatId: row.chatId!, ...(focus ? { focus } : {}) }, status: "QUEUED" });
      return copy(next);
    },
  };
}

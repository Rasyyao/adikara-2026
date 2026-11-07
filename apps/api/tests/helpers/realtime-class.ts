import http from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { performance } from "node:perf_hooks";
import type { Express } from "express";
import { expect } from "vitest";

/**
 * A whole class acting at the same moment against one real HTTP server: the teacher and every student hold an open event
 * stream, and each step fires everyone's requests together. Every event is stamped when it arrives, so the latency of a
 * step is "request sent" → "event received by the person who should see it", including the server's work (and the
 * database's, when the repositories are real). Used by the fake-database test and the PostgreSQL integration test.
 */

/** Target from the classroom requirements: what one person does is on the others' screens within a second. */
export const MAX_LATENCY_MS = 1000;
const WAIT_MS = 5000;

export interface Received {
  type: string;
  data: any;
  at: number;
}

export interface Stream {
  received: Received[];
  status: number;
  closed: Promise<void>;
  /** The first received event (from index `from`) that matches; waits up to WAIT_MS. */
  find(match: (e: Received) => boolean, from?: number): Promise<Received>;
  close(): void;
}

export interface Server {
  base: string;
  /** Sends a JSON request; `sentAt` is when it left. */
  call(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: any; sentAt: number }>;
  stream(path: string, headers: Record<string, string>): Promise<Stream>;
  close(): Promise<void>;
}

export async function startServer(app: Express): Promise<Server> {
  const server = http.createServer(app).listen(0, "127.0.0.1");
  // a class is many keep-alive streams at once; do not let the default limits get in the way
  server.maxConnections = 1000;
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const controllers = new Set<AbortController>();

  return {
    base,
    async call(method, path, headers, body) {
      const sentAt = performance.now();
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null, sentAt };
    },
    async stream(path, headers) {
      const controller = new AbortController();
      controllers.add(controller);
      const res = await fetch(`${base}${path}`, { headers, signal: controller.signal });
      const received: Received[] = [];
      const wakers = new Set<() => void>();
      let resolveClosed!: () => void;
      const closed = new Promise<void>((resolve) => (resolveClosed = resolve));
      void (async () => {
        if (!res.body || !(res.headers.get("content-type") ?? "").startsWith("text/event-stream")) return resolveClosed();
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const at = performance.now();
            buffer += decoder.decode(value, { stream: true });
            let end: number;
            while ((end = buffer.indexOf("\n\n")) >= 0) {
              const block = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              const type = /^event: (.+)$/m.exec(block)?.[1];
              const data = /^data: (.+)$/m.exec(block)?.[1];
              if (type && data) received.push({ type, data: JSON.parse(data), at });
            }
            wakers.forEach((wake) => wake());
          }
        } catch {
          // aborted
        } finally {
          resolveClosed();
          wakers.forEach((wake) => wake());
        }
      })();
      let ended = false;
      void closed.then(() => (ended = true));
      return {
        received,
        status: res.status,
        closed,
        async find(match, from = 0) {
          const deadline = performance.now() + WAIT_MS;
          for (;;) {
            const hit = received.slice(from).find(match);
            if (hit) return hit;
            const left = deadline - performance.now();
            if (left <= 0 || ended) {
              throw new Error(`event not received within ${WAIT_MS}ms; got: ${received.map((e) => e.type).join(", ") || "nothing"}`);
            }
            await new Promise<void>((resolve) => {
              const wake = () => {
                wakers.delete(wake);
                resolve();
              };
              wakers.add(wake);
              setTimeout(wake, left);
            });
          }
        },
        close() {
          controller.abort();
          controllers.delete(controller);
        },
      };
    },
    async close() {
      controllers.forEach((c) => c.abort());
      server.closeAllConnections();
      server.close();
      await once(server, "close").catch(() => {});
    },
  };
}

// ---- latency bookkeeping ------------------------------------------------------------------------------------------

export type Report = Map<string, number[]>;

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

/** One line per step: how many deliveries and their p50 / p95 / max in ms. */
export function summarize(report: Report) {
  return [...report.entries()].map(([step, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return { step, deliveries: values.length, p50: +percentile(sorted, 50).toFixed(1), p95: +percentile(sorted, 95).toFixed(1), max: +sorted[sorted.length - 1].toFixed(1) };
  });
}

// ---- the class period ---------------------------------------------------------------------------------------------

export interface Person {
  id: string;
  headers: Record<string, string>;
}

const QUIZ = {
  title: "Kuis Serentak",
  kind: "quiz",
  questions: [
    { question: "x = 5 lalu x = 7. Isi x?", options: [{ key: "A", text: "5" }, { key: "B", text: "7" }], answer: "B", explanation: "Ditimpa.", source: "Variabel" },
    { question: "Tipe dari 3.5?", options: [{ key: "A", text: "int" }, { key: "B", text: "float" }], answer: "B", explanation: "Ada koma.", source: "Tipe data" },
  ],
};

const CHALLENGE = {
  prompt: "Susun program robot.",
  hint: "Ulangi langkahnya.",
  ordered: true,
  blocks: [
    { id: "a", kind: "event", text: "ketika mulai" },
    { id: "b", kind: "loop", text: "ulangi 2 kali" },
    { id: "c", kind: "action", text: "maju" },
    { id: "d", kind: "action", text: "lompat" },
  ],
  solution: [{ block: "a" }, { block: "b", children: [{ block: "c" }] }],
  code: null,
};

const rect = (id: string, x = 0) => ({ id, type: "rectangle", x, y: 0, width: 10, height: 10 });

/**
 * A class period in which everyone acts at once, checking at each step that every event reached everyone it should
 * (and nobody it should not), that nothing was lost or doubled, and how long it took.
 */
export async function runClassPeriod(server: Server, opts: { teacher: Person; students: Person[]; classCode: string }): Promise<Report> {
  const { teacher, students } = opts;
  const report: Report = new Map();
  const record = (step: string, ms: number) => report.set(step, [...(report.get(step) ?? []), ms]);
  const api = (path: string) => `/api/v1${path}`;
  const streams: Stream[] = [];
  const open = async (p: Person, id: string) => {
    const s = await server.stream(api(`/sessions/${id}/events`), p.headers);
    streams.push(s);
    return s;
  };

  try {
    // 1. the teacher opens the session and watches; the whole class types the PIN at the same moment
    const created = await server.call("POST", api("/sessions"), teacher.headers, { class_code: opts.classCode });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id: string = created.body.session.id;
    const pin: string = created.body.session.join_code;
    const teacherStream = await open(teacher, id);
    await teacherStream.find((e) => e.type === "snapshot");

    const joins = await Promise.all(students.map((s) => server.call("POST", api("/sessions/join"), s.headers, { code: pin })));
    joins.forEach((j) => expect(j.status, JSON.stringify(j.body)).toBe(200));
    for (const [i, s] of students.entries()) {
      const event = await teacherStream.find((e) => e.type === "participant_joined" && e.data.student_id === s.id);
      record("join → teacher sees student", event.at - joins[i].sentAt);
    }
    const counts = teacherStream.received.filter((e) => e.type === "participant_joined").map((e) => e.data.participant_count);
    expect(Math.max(...counts)).toBe(students.length); // concurrent joins are all counted

    // 2. every student opens the board at once
    const connectStart = performance.now();
    const studentStreams = await Promise.all(students.map((s) => open(s, id)));
    for (const st of studentStreams) {
      const snap = await st.find((e) => e.type === "snapshot");
      record("connect → student snapshot", snap.at - connectStart);
      expect(snap.data.participant_count).toBe(students.length);
    }

    // 3. the teacher starts the class: everyone is told
    const start = await server.call("POST", api(`/sessions/${id}/start`), teacher.headers);
    expect(start.status).toBe(200);
    for (const st of studentStreams) record("teacher start → student", (await st.find((e) => e.type === "session_started")).at - start.sentAt);

    // 4. everyone draws at the same moment: each shape reaches everyone, none is lost or refused
    const people = [teacher, ...students];
    const allStreams = [teacherStream, ...studentStreams];
    const marks = allStreams.map((s) => s.received.length);
    const draws = await Promise.all(people.map((p, i) => server.call("POST", api(`/sessions/${id}/live`), p.headers, { upserts: [rect(`shape-${i}`, i * 20)] })));
    draws.forEach((d) => {
      expect(d.status, JSON.stringify(d.body)).toBe(200);
      expect(d.body.revert).toEqual({ upserts: [], deletes: [] });
    });
    for (const [r, stream] of allStreams.entries()) {
      for (const [i] of people.entries()) {
        const event = await stream.find((e) => e.type === "board_ops" && e.data.upserts.some((u: { id: string }) => u.id === `shape-${i}`), marks[r]);
        if (i !== r) record("draw → everyone else's board", event.at - draws[i].sentAt);
      }
      const seen = stream.received.slice(marks[r]).filter((e) => e.type === "board_ops").flatMap((e) => e.data.upserts.map((u: { id: string }) => u.id));
      expect(new Set(seen).size).toBe(people.length); // every shape once, from every sender
    }

    // 5. cursors move together: the teacher's reaches everyone, a student's only the teacher
    const cursorMarks = allStreams.map((s) => s.received.length);
    const moves = await Promise.all(people.map((p, i) => server.call("POST", api(`/sessions/${id}/live`), p.headers, { cursor: { x: i, y: i } })));
    moves.forEach((m) => expect(m.status).toBe(200));
    for (const [i, s] of students.entries()) {
      record("student cursor → teacher", (await teacherStream.find((e) => e.type === "cursor" && e.data.id === s.id, cursorMarks[0])).at - moves[i + 1].sentAt);
    }
    for (const [r, st] of studentStreams.entries()) {
      record("teacher cursor → student", (await st.find((e) => e.type === "cursor" && e.data.role === "teacher", cursorMarks[r + 1])).at - moves[0].sentAt);
    }

    // 6. the teacher locks the board while students keep drawing: the lock reaches everyone, later strokes are undone
    const lock = await server.call("POST", api(`/sessions/${id}/live`), teacher.headers, { draw_allowed: false });
    expect(lock.status).toBe(200);
    for (const st of studentStreams) record("teacher locks board → student", (await st.find((e) => e.type === "board_mode" && e.data.draw_allowed === false)).at - lock.sentAt);
    const late = await Promise.all(students.map((s, i) => server.call("POST", api(`/sessions/${id}/live`), s.headers, { upserts: [rect(`late-${i}`)] })));
    late.forEach((l, i) => expect(l.body.revert.deletes).toEqual([`late-${i}`]));
    await server.call("POST", api(`/sessions/${id}/live`), teacher.headers, { draw_allowed: true });

    // a newcomer's snapshot holds exactly the shapes drawn, whoever drew them
    const check = await server.stream(api(`/sessions/${id}/events`), teacher.headers);
    const board = (await check.find((e) => e.type === "snapshot")).data.live.board.elements.map((e: { id: string }) => e.id).sort();
    check.close();
    expect(board).toEqual(people.map((_, i) => `shape-${i}`).sort());

    // 7. a quiz: opened for everyone, then the whole class answers and hands in at once (half right, half wrong)
    const quiz = await server.call("POST", api(`/sessions/${id}/quizzes`), teacher.headers, QUIZ);
    expect(quiz.status, JSON.stringify(quiz.body)).toBe(201);
    const quizId: string = quiz.body.quiz.id;
    for (const st of studentStreams) record("quiz opened → student", (await st.find((e) => e.type === "quiz_opened")).at - quiz.sentAt);

    const base = api(`/sessions/${id}/quizzes/${quizId}`);
    const pick = (i: number) => (i % 2 === 0 ? "B" : "A");
    await Promise.all(
      students.map(async (s, i) => {
        expect((await server.call("POST", `${base}/attempt`, s.headers, {})).status).toBeLessThan(300);
        for (const q of [1, 2]) {
          const answered = await server.call("PUT", `${base}/attempt/answers`, s.headers, { question_id: q, choice: pick(i), time_ms: 500 });
          expect(answered.status, JSON.stringify(answered.body)).toBe(200);
          const event = await teacherStream.find((e) => e.type === "quiz_progress" && e.data.student_id === s.id && e.data.answered === q);
          record("student answers → teacher progress", event.at - answered.sentAt);
        }
        const submitted = await server.call("POST", `${base}/attempt/submit`, s.headers);
        expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
        const event = await teacherStream.find((e) => e.type === "quiz_progress" && e.data.student_id === s.id && e.data.submitted);
        record("student submits → teacher progress", event.at - submitted.sentAt);
        expect(event.data.score).toBe(pick(i) === "B" ? 2 : 0);
      }),
    );
    const results = await server.call("GET", `${base}/results`, teacher.headers);
    const right = students.filter((_, i) => pick(i) === "B").length;
    expect(results.body.summary).toMatchObject({ submitted: students.length, highest: 2, lowest: right === students.length ? 2 : 0 });

    // 8. a problem: sent to everyone, the whole class checks an answer at once
    const draft = await server.call("POST", api("/problems"), teacher.headers, { title: "Robot", story: "Robot harus maju dua kali." });
    const problemId: string = draft.body.problem.id;
    expect((await server.call("PUT", api(`/problems/${problemId}`), teacher.headers, { title: "Robot", story: "Robot harus maju dua kali.", challenge: CHALLENGE })).status).toBe(200);
    expect((await server.call("POST", api(`/problems/${problemId}/status`), teacher.headers, { status: "ready" })).status).toBe(200);
    const sent = await server.call("POST", api(`/sessions/${id}/problems`), teacher.headers, { problem_id: problemId });
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    const sentId: string = sent.body.problem.id;
    for (const st of studentStreams) record("problem sent → student", (await st.find((e) => e.type === "problem_opened")).at - sent.sentAt);

    const checks = await Promise.all(
      students.map((s, i) => server.call("POST", api(`/sessions/${id}/problems/${sentId}/check`), s.headers, { answer: i % 2 === 0 ? CHALLENGE.solution : [{ block: "d" }] })),
    );
    for (const [i, s] of students.entries()) {
      expect(checks[i].status, JSON.stringify(checks[i].body)).toBe(200);
      expect(checks[i].body.grade.correct).toBe(i % 2 === 0);
      const event = await teacherStream.find((e) => e.type === "problem_progress" && e.data.student_id === s.id);
      record("student checks → teacher progress", event.at - checks[i].sentAt);
      expect(event.data.solved).toBe(i % 2 === 0);
    }

    // 9. while the class works, the teacher removes one student: only they are kicked out, the teacher sees it
    const leaver = students[students.length - 1];
    const leaverStream = studentStreams[studentStreams.length - 1];
    const kick = await server.call("DELETE", api(`/sessions/${id}/participants/${leaver.id}`), teacher.headers);
    expect(kick.status, JSON.stringify(kick.body)).toBeLessThan(300);
    record("teacher kicks → student", (await leaverStream.find((e) => e.type === "kicked")).at - kick.sentAt);
    record("teacher kicks → teacher list", (await teacherStream.find((e) => e.type === "participant_left" && e.data.student_id === leaver.id)).at - kick.sentAt);
    await leaverStream.closed;
    expect(studentStreams.slice(0, -1).every((st) => !st.received.some((e) => e.type === "kicked"))).toBe(true);
    const refused = await server.call("POST", api(`/sessions/${id}/live`), leaver.headers, { cursor: { x: 1, y: 1 } });
    expect(refused.status).toBe(403);

    // 10. the teacher ends the class: everyone still in is told and their stream closes
    const end = await server.call("POST", api(`/sessions/${id}/end`), teacher.headers);
    expect(end.status).toBe(200);
    for (const st of studentStreams.slice(0, -1)) {
      record("teacher ends → student", (await st.find((e) => e.type === "session_ended")).at - end.sentAt);
      await st.closed;
    }
    // and nobody can draw on an ended class, not even with access remembered from a moment ago
    const afterEnd = await server.call("POST", api(`/sessions/${id}/live`), students[0].headers, { upserts: [rect("after-end")] });
    expect(afterEnd.status).toBe(409);
    return report;
  } finally {
    streams.forEach((s) => s.close());
  }
}

/** Fails with the whole table when any delivery took longer than the target. */
export function expectWithinTarget(report: Report) {
  const rows = summarize(report);
  console.table(rows);
  const slow = rows.filter((r) => r.max > MAX_LATENCY_MS);
  expect(slow, `steps slower than ${MAX_LATENCY_MS}ms`).toEqual([]);
}

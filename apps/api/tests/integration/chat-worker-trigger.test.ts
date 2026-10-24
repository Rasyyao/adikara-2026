import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { createApp } from "../../src/app.js";
import { createPrisma } from "../../src/db/prisma.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { ObjectStorage } from "../../src/lib/storage.js";
import { createTokenService } from "../../src/lib/token.js";
import { createRepositories } from "../../src/repositories/index.js";
import { TEST_SECRET, testConfig } from "../helpers/config.js";
import { createMemoryStorage } from "../helpers/memory-storage.js";

/**
 * Uploads the real `test-modul.pdf` through the HTTP API and checks what the Python worker (adikara-ai) needs to start:
 * the PDF in storage, a `materials` row (UPLOADED), an EXTRACT job (QUEUED) and a `NOTIFY jobs`.
 *
 * Runs against the local development database (DATABASE_URL) and wipes its tables.
 *
 * The last block starts the real worker process (`python worker.py`) and only uploads through the API: the NOTIFY has to
 * wake it. It is opt-in because it needs R2, Ollama (embeddings) and the worker's venv:
 *   RUN_WORKER_E2E=1 WORKER_DIR=../../../adikara-ai pnpm exec vitest run tests/integration/chat-worker-trigger
 */
// the local development database (the same one the Python worker listens on)
const url = process.env.DATABASE_URL;
const safe = Boolean(url);

const PDF_PATH = fileURLToPath(new URL("../../../../test-modul.pdf", import.meta.url));
const MESSAGES = (chatId: string) => `/api/v1/chats/${chatId}/messages`;

describe.skipIf(!safe)("uploading test-modul.pdf triggers the Python worker", () => {
  let prisma: PrismaClient;
  let teacherId: string;
  let auth: { Authorization: string };
  const pdf = readFileSync(PDF_PATH);
  const storage = createMemoryStorage();

  const buildApp = (overrides: Parameters<typeof testConfig>[0] = {}, objectStorage: ObjectStorage = storage) =>
    createApp({
      config: testConfig({ uploadMaxBytes: 20 * 1024 * 1024, ...overrides }),
      pingDb: async () => {
        await prisma.$queryRaw`SELECT 1`;
      },
      repositories: createRepositories(prisma),
      storage: objectStorage,
    });

  const clean = async () => {
    await prisma.job.deleteMany();
    await prisma.chat.deleteMany();
    await prisma.material.deleteMany();
    await prisma.sessionParticipant.deleteMany();
    await prisma.classSession.deleteMany();
    await prisma.student.deleteMany();
    await prisma.classroom.deleteMany();
    await prisma.teacher.deleteMany();
  };

  const startChat = async (app: Awaited<ReturnType<typeof buildApp>>) =>
    (await request(app).post("/api/v1/chats").set(auth).send({ title: "Modul" })).body.chat.id as string;

  const sendPdf = (app: Awaited<ReturnType<typeof buildApp>>, chatId: string, text = "Tolong rangkum modul ini") =>
    request(app).post(MESSAGES(chatId)).set(auth).field("text", text).attach("file", pdf, { filename: "test-modul.pdf", contentType: "application/pdf" });

  beforeAll(() => {
    prisma = createPrisma(url as string);
  });

  beforeEach(async () => {
    await clean();
    storage.objects.clear();
    teacherId = (await prisma.teacher.create({ data: { email: "guru@example.com", name: "Guru", passwordHash: "x" } })).id;
    const tokens = createTokenService({ secret: TEST_SECRET, ttlSeconds: 60 });
    auth = { Authorization: `Bearer ${tokens.sign({ userId: teacherId, role: "TEACHER", kind: "teacher" })}` };
  });

  afterAll(async () => {
    await clean();
    await prisma?.$disconnect();
  });

  it("answers 202 with the material UPLOADED and a reply pending", async () => {
    const app = await buildApp();
    const res = await sendPdf(app, await startChat(app));

    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(res.body.material).toMatchObject({ title: "test-modul", file_type: "pdf", status: "UPLOADED" });
    expect(res.body.reply_pending).toBe(true);
  });

  it("stores the exact bytes of the PDF under the key the worker will download", async () => {
    const app = await buildApp();
    await sendPdf(app, await startChat(app));

    const material = await prisma.material.findFirstOrThrow();
    expect(material.filePath).toMatch(new RegExp(`^materials/${teacherId}/[0-9a-f-]+\\.pdf$`));
    const stored = storage.objects.get(material.filePath);
    expect(stored?.contentType).toBe("application/pdf");
    expect(stored?.body.equals(pdf)).toBe(true);
    expect(stored?.body.subarray(0, 5).toString()).toBe("%PDF-"); // extract.py rejects anything else
  });

  it("queues one EXTRACT job for that material and one CHAT_REPLY job for the chat", async () => {
    const app = await buildApp();
    const chatId = await startChat(app);
    const res = await sendPdf(app, chatId);

    const jobs = await prisma.job.findMany({ orderBy: { type: "asc" } });
    expect(jobs.map((j) => [j.type, j.status, j.attempts])).toEqual([
      ["EXTRACT", "QUEUED", 0],
      ["CHAT_REPLY", "QUEUED", 0],
    ]);
    expect(jobs[0].payload).toEqual({ materialId: res.body.material.id });
    expect(jobs[1].payload).toEqual({ chatId, messageId: res.body.message.id });
  });

  it("sends NOTIFY jobs, and by then the EXTRACT job is already committed", async () => {
    const app = await buildApp();
    const chatId = await startChat(app);
    const listener = new pg.Client({ connectionString: url });
    await listener.connect();
    try {
      await listener.query("LISTEN jobs");
      const seenAtNotify = new Promise<string[]>((resolveNotify) => {
        listener.once("notification", async () => {
          resolveNotify((await prisma.job.findMany({ where: { status: "QUEUED" } })).map((j) => j.type));
        });
      });
      await sendPdf(app, chatId);
      expect((await seenAtNotify).sort()).toEqual(["CHAT_REPLY", "EXTRACT"]);
    } finally {
      await listener.end();
    }
  });

  it("the worker's claim query can pick the EXTRACT job up (and holds the reply back until the PDF is read)", async () => {
    const app = await buildApp();
    await sendPdf(app, await startChat(app));

    // same conditions as CLAIM in adikara-ai/worker.py
    const claimable = await prisma.$queryRaw<{ type: string }[]>`
      SELECT j.type::text AS type FROM jobs j
      WHERE j.status = 'queued' AND j.locked_at IS NULL
        AND (j.type = 'extract' OR NOT EXISTS (
          SELECT 1 FROM chat_materials cm JOIN materials m ON m.id = cm.material_id
          WHERE cm.chat_id = (j.payload->>'chatId')::uuid AND m.status = 'uploaded'))`;
    expect(claimable.map((j) => j.type)).toEqual(["extract"]);
  });

  it("stores nothing and queues nothing when the storage is down", async () => {
    const app = await buildApp();
    const chatId = await startChat(app);
    storage.state.failNext = true;
    const res = await sendPdf(app, chatId);

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await prisma.job.count()).toBe(0);
    expect(await prisma.material.count()).toBe(0);
  });

  const runWorker = process.env.RUN_WORKER_E2E === "1" && Boolean(process.env.WORKER_DIR);

  /** Polls until `read` returns something truthy, or fails after `ms`. */
  const waitFor = async <T>(what: string, read: () => Promise<T | null | false>, ms = 120_000): Promise<T> => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const value = await read();
      if (value) return value;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`timed out waiting for ${what}`);
  };

  describe.skipIf(!runWorker)("end to end: API upload -> NOTIFY -> a running worker (needs R2, Ollama and the adikara-ai venv)", () => {
    let worker: ChildProcess;
    let log = "";

    beforeEach(async () => {
      const workerDir = resolve(process.env.WORKER_DIR as string);
      log = "";
      // `python worker.py` is the same process you run in production: LISTEN jobs, then drain on every wake-up.
      worker = spawn(resolve(workerDir, ".venv/bin/python"), ["-u", "worker.py"], {
        cwd: workerDir,
        env: { ...process.env, DATABASE_URL: url, PYTHONPATH: workerDir },
      });
      worker.stdout?.on("data", (d) => (log += d));
      worker.stderr?.on("data", (d) => (log += d));
      await waitFor("the worker to start listening", async () => /menunggu job/.test(log) || (worker.exitCode !== null && Promise.reject(new Error(`worker exited:\n${log}`))), 30_000);
    });

    afterEach(() => {
      worker?.kill("SIGTERM");
    });

    it("the worker wakes by itself, reads the PDF from R2, indexes it and answers in the chat", async () => {
      const { createObjectStorage } = await import("../../src/lib/storage.js");
      const real = loadConfig(process.env).storage;
      expect(real, "R2_* must be set in the root .env").not.toBeNull();

      const app = await buildApp({}, createObjectStorage(real));
      const chatId = await startChat(app);
      const res = await sendPdf(app, chatId);
      expect(res.status).toBe(202);
      const materialId = res.body.material.id as string;

      // nobody calls the worker: the NOTIFY from the API has to be enough
      const material = await waitFor("the material to leave UPLOADED", async () => {
        const m = await prisma.material.findUniqueOrThrow({ where: { id: materialId } });
        return m.status === "UPLOADED" ? null : m;
      });
      expect(material, log).toMatchObject({ status: "EXTRACTED", error: null });
      expect(await prisma.materialChunk.count({ where: { materialId } })).toBeGreaterThan(0);

      // the reply job is held back until the file is read, then answered
      const reply = await waitFor("the assistant reply", () => prisma.chatMessage.findFirst({ where: { chatId, role: "ASSISTANT" } }));
      expect(reply.content.length).toBeGreaterThan(0);

      const statuses = (await prisma.job.findMany({ orderBy: { type: "asc" } })).map((j) => [j.type, j.status]);
      expect(statuses, log).toEqual([["EXTRACT", "DONE"], ["CHAT_REPLY", "DONE"]]);

      // and the API now reports it finished
      const detail = await request(app).get(MESSAGES(chatId)).set(auth);
      expect(detail.body.reply_pending).toBe(false);
    }, 240_000);
  });
});

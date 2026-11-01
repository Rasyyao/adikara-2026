import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { openStream, type OpenStream } from "../helpers/sse.js";
import { SESSION_PATHS, TEACHER_AUTH, auth, createSession, joinSession, studentAuth } from "../helpers/sessions.js";

const open: OpenStream[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((stream) => stream.close()));
});

async function stream(app: Parameters<typeof openStream>[0], id: string, as = TEACHER_AUTH) {
  const s = await openStream(app, SESSION_PATHS.events(id), auth(as));
  open.push(s);
  return s;
}

/** The next event of a type, skipping the others. */
async function nextOf(s: OpenStream, type: string) {
  for (;;) {
    const event = await s.next(1000);
    if (event.type === type) return event;
  }
}

const rect = (id: string, x = 0) => ({ id, type: "rectangle", x, y: 0, width: 10, height: 10 });

/** A started session with student "satu" in it, and both streams open past their snapshot. */
async function liveClass() {
  const { app } = await buildTestApp();
  const { id, code } = await createSession(app);
  await joinSession(app, code, "satu");
  await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));
  const teacher = await stream(app, id);
  const student = await stream(app, id, studentAuth("satu"));
  await teacher.next();
  await student.next();
  const send = (body: object, as = TEACHER_AUTH) => request(app).post(SESSION_PATHS.liveBoard(id)).set(auth(as)).send(body);
  return { app, id, teacher, student, send };
}

describe("POST /sessions/:id/live (shared whiteboard)", () => {
  it("the teacher's drawing reaches the student, and a new stream starts from it", async () => {
    const { app, id, student, send } = await liveClass();
    expect((await send({ upserts: [rect("a")] })).status).toBe(200);

    const ops = await nextOf(student, "board_ops");
    expect(ops.data).toMatchObject({ upserts: [rect("a")], deletes: [] });

    const late = await stream(app, id, studentAuth("satu"));
    const snapshot = await late.next();
    expect(snapshot.data.live.board.elements).toEqual([rect("a")]);
    expect(snapshot.data.live.me).toMatchObject({ role: "student" });
  });

  it("a student draws, but cannot change or delete what the teacher drew", async () => {
    const { teacher, send } = await liveClass();
    await send({ upserts: [rect("teacher")] });
    await nextOf(teacher, "board_ops");

    const mine = await send({ upserts: [rect("mine")] }, studentAuth("satu"));
    expect(mine.body.revert).toEqual({ upserts: [], deletes: [] });
    expect((await nextOf(teacher, "board_ops")).data.upserts).toEqual([rect("mine")]);

    const theirs = await send({ upserts: [rect("teacher", 99)], deletes: ["teacher"] }, studentAuth("satu"));
    expect(theirs.body.revert.upserts).toEqual([rect("teacher"), rect("teacher")]);
  });

  it("a student who joined in the lobby can draw the moment the class starts", async () => {
    const { app } = await buildTestApp();
    const { id, code } = await createSession(app);
    await joinSession(app, code, "satu");
    const student = await stream(app, id, studentAuth("satu"));
    await student.next(); // the snapshot, read while the session was in the lobby
    await request(app).post(SESSION_PATHS.start(id)).set(auth(TEACHER_AUTH));

    const drawn = await request(app).post(SESSION_PATHS.liveBoard(id)).set(auth(studentAuth("satu"))).send({ upserts: [rect("first")] });
    expect(drawn.body.revert).toEqual({ upserts: [], deletes: [] });
  });

  it("while drawing is locked a student's new shape is taken back", async () => {
    const { student, send } = await liveClass();
    await send({ draw_allowed: false });
    expect((await nextOf(student, "board_mode")).data).toEqual({ draw_allowed: false });

    const refused = await send({ upserts: [rect("late")] }, studentAuth("satu"));
    expect(refused.body.revert).toEqual({ upserts: [], deletes: ["late"] });
    expect((await send({ draw_allowed: true }, studentAuth("satu"))).status).toBe(403);
  });

  it("the teacher's cursor goes to the students with the teacher's name; a student's only to the teacher", async () => {
    const { teacher, student, send } = await liveClass();
    await send({ cursor: { x: 10, y: 20 } });
    const seen = await nextOf(student, "cursor");
    expect(seen.data).toMatchObject({ role: "teacher", x: 10, y: 20 });
    expect(typeof seen.data.name).toBe("string");

    expect((await nextOf(teacher, "cursor")).data).toMatchObject({ role: "teacher" }); // the sender hears its own; clients skip it
    await send({ cursor: { x: 5, y: 6 } }, studentAuth("satu"));
    expect((await nextOf(teacher, "cursor")).data).toMatchObject({ role: "student", x: 5, y: 6 });
    await send({ cursor: null });
    expect((await nextOf(student, "cursor")).data).toMatchObject({ role: "teacher", hidden: true }); // not the student's own
  });

  it("refuses a student who did not join, and a malformed cursor", async () => {
    const { send } = await liveClass();
    expect((await send({ cursor: { x: 1, y: 1 } }, studentAuth("dua"))).status).toBe(403);
    expect((await send({ cursor: { x: "a" } })).status).toBe(400);
  });
});

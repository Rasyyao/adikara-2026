import { AppError } from "../../http/errors.js";
import type { AuthContext } from "../../types/auth.types.js";
import type { LiveActor, LiveBoardStore, LiveInput, LiveResult, LiveSnapshot } from "../../types/shared/live-board.types.js";
import type { SessionRecord } from "../../types/shared/session.types.js";
import type { SessionCore } from "./session-core.js";
import { sessionEnded, sessionNotFound } from "./session-views.js";

/** How long after the last change the drawing is written to the database. */
const SAVE_DELAY_MS = 1500;
/** How long who-may-do-what is remembered, so a moving cursor does not ask the database every time. */
const ACCESS_TTL_MS = 5000;
/** A board nobody touched for this long is written and dropped from memory. */
const IDLE_MS = 30 * 60 * 1000;

/**
 * The whiteboard a teacher and the students draw on together. Every change goes through here: it is checked (a student
 * may only change what they drew, and only while the teacher allows drawing), applied to the live copy, sent to the
 * others over the session's event stream, and written to the database shortly after. Cursors pass straight through:
 * the teacher's to everyone, a student's to the teacher only.
 */
export interface LiveBoardService {
  /** The board, the drawing rule and who the viewer is, for the first event of a stream. */
  snapshot(auth: AuthContext, session: SessionRecord): Promise<LiveSnapshot>;
  apply(auth: AuthContext, sessionId: string, input: LiveInput): Promise<LiveResult>;
  /** The teacher saved the whole board: the live copy follows it. */
  replace(sessionId: string, elements: Record<string, unknown>[]): void;
}

interface Live {
  /** In drawing order. */
  elements: Map<string, Record<string, unknown>>;
  /** Who drew each element; elements with no owner are the teacher's. */
  owners: Map<string, string>;
  background: string | undefined;
  drawAllowed: boolean;
  saveTimer: NodeJS.Timeout | null;
  lastUsed: number;
}

interface Access {
  actor: LiveActor;
  session: SessionRecord;
  expires: number;
}

export function createLiveBoardService(core: SessionCore, store: LiveBoardStore): LiveBoardService {
  const { hub, sessions } = core;
  const boards = new Map<string, Promise<Live>>();
  const access = new Map<string, Access>();

  const load = (sessionId: string): Promise<Live> => {
    let found = boards.get(sessionId);
    if (!found) {
      found = store.findBoard(sessionId).then((record) => {
        const elements = new Map<string, Record<string, unknown>>();
        const owners = new Map<string, string>();
        for (const e of record?.scene.elements ?? []) {
          if (typeof e.id !== "string") continue;
          elements.set(e.id, e);
          if (typeof e.createdBy === "string") owners.set(e.id, e.createdBy);
        }
        return { elements, owners, background: record?.scene.appState.viewBackgroundColor, drawAllowed: true, saveTimer: null, lastUsed: Date.now() };
      });
      found.catch(() => boards.delete(sessionId)); // a failed read is tried again next time
      boards.set(sessionId, found);
    }
    return found;
  };

  const save = async (sessionId: string, live: Live) => {
    live.saveTimer = null;
    const elements = [...live.elements.values()].map((e) => {
      const owner = live.owners.get(e.id as string);
      return owner ? { ...e, createdBy: owner } : e;
    });
    try {
      await store.saveBoard(sessionId, { elements, appState: live.background ? { viewBackgroundColor: live.background } : {} });
    } catch (err) {
      console.error("failed to save the live board", err);
    }
  };

  const scheduleSave = (sessionId: string, live: Live) => {
    if (live.saveTimer) clearTimeout(live.saveTimer);
    live.saveTimer = setTimeout(() => void save(sessionId, live), SAVE_DELAY_MS);
    live.saveTimer.unref();
  };

  // boards left alone are written and forgotten, so memory does not grow with every class ever held
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, pending] of boards) {
      void pending.then((live) => {
        if (now - live.lastUsed < IDLE_MS) return;
        boards.delete(sessionId);
        if (live.saveTimer) {
          clearTimeout(live.saveTimer);
          void save(sessionId, live);
        }
      });
    }
    for (const [key, entry] of access) if (entry.expires < now) access.delete(key);
  }, 10 * 60 * 1000);
  sweep.unref();

  /** Who is sending, and the session, checked: the teacher who runs it, or a student who joined and was not removed. */
  const actorOf = async (auth: AuthContext, sessionId: string): Promise<Access> => {
    const key = `${sessionId}:${auth.userId}`;
    const cached = access.get(key);
    if (cached && cached.expires > Date.now()) return cached;
    let entry: Access;
    if (auth.kind === "teacher") {
      const session = await core.loadManaged(auth, sessionId);
      const name = (await store.findTeacherName(auth.userId)) ?? "Guru";
      entry = { session, actor: { id: auth.userId, name, role: "teacher" }, expires: Date.now() + ACCESS_TTL_MS };
    } else {
      const found = await sessions.findSessionById(sessionId);
      if (!found) throw sessionNotFound();
      const session = await core.closeIfExpired(found);
      const participant = await sessions.findParticipant(session.id, auth.userId);
      if (!participant) throw new AppError(403, "not_joined", "Join the session with its PIN first");
      if (participant.kickedAt) throw new AppError(403, "kicked", "You were removed from this session");
      entry = { session, actor: { id: auth.userId, name: participant.name ?? participant.username ?? "Siswa", role: "student" }, expires: Date.now() + ACCESS_TTL_MS };
    }
    // only a running class is remembered: a session in the lobby is about to start, and a student drawing the moment it
    // does must not be refused on the old status
    if (entry.session.status === "ACTIVE") access.set(key, entry);
    else access.delete(key);
    return entry;
  };

  return {
    async snapshot(auth, session) {
      const [live, { actor }] = await Promise.all([load(session.id), actorOf(auth, session.id)]);
      return { board: { elements: [...live.elements.values()] }, draw_allowed: live.drawAllowed, me: actor };
    },

    async apply(auth, sessionId, input) {
      const { actor, session } = await actorOf(auth, sessionId);
      if (session.status === "ENDED") throw sessionEnded();
      const teacher = actor.role === "teacher";
      const result: LiveResult = { revert: { upserts: [], deletes: [] } };

      if (input.cursor !== undefined) {
        const data = input.cursor ? { ...actor, ...input.cursor } : { ...actor, hidden: true };
        hub.publish(session.id, { type: "cursor", data }, teacher ? "all" : "staff");
      }

      const changes = (input.upserts?.length ?? 0) + (input.deletes?.length ?? 0);
      if (input.drawAllowed === undefined && changes === 0) return result;
      const live = await load(session.id);
      live.lastUsed = Date.now();

      if (input.drawAllowed !== undefined) {
        if (!teacher) throw new AppError(403, "forbidden", "Only the teacher decides who may draw");
        live.drawAllowed = input.drawAllowed;
        hub.publish(session.id, { type: "board_mode", data: { draw_allowed: live.drawAllowed } }, "all");
      }
      if (changes === 0) return result;

      // a student draws only while the class is running and the teacher allows it, and only on what they drew
      const studentMay = !teacher && session.status === "ACTIVE" && live.drawAllowed;
      const mayTouch = (id: string) => teacher || (studentMay && (!live.elements.has(id) || live.owners.get(id) === actor.id));
      const upserts: Record<string, unknown>[] = [];
      const deletes: string[] = [];
      for (const element of input.upserts ?? []) {
        const id = element.id as string;
        if (!mayTouch(id)) {
          const kept = live.elements.get(id);
          if (kept) result.revert.upserts.push(kept);
          else result.revert.deletes.push(id);
          continue;
        }
        const clean = { ...element };
        delete clean.createdBy; // ownership is the server's to say
        if (!live.elements.has(id) && !teacher) live.owners.set(id, actor.id);
        live.elements.set(id, clean);
        upserts.push(clean);
      }
      for (const id of input.deletes ?? []) {
        if (!live.elements.has(id)) continue;
        if (!mayTouch(id)) {
          result.revert.upserts.push(live.elements.get(id)!);
          continue;
        }
        live.elements.delete(id);
        live.owners.delete(id);
        deletes.push(id);
      }
      if (upserts.length || deletes.length) {
        hub.publish(session.id, { type: "board_ops", data: { by: actor.id, upserts, deletes } }, "all");
        scheduleSave(session.id, live);
      }
      return result;
    },

    replace(sessionId, elements) {
      const pending = boards.get(sessionId);
      if (!pending) return; // nobody is drawing live; the database already has it
      void pending.then((live) => {
        live.elements = new Map(elements.flatMap((e) => (typeof e.id === "string" ? [[e.id, e] as const] : [])));
        for (const id of live.owners.keys()) if (!live.elements.has(id)) live.owners.delete(id);
        live.lastUsed = Date.now();
      });
    },
  };
}

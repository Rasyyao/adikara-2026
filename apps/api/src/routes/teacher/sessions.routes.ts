import { ref } from "../../docs/schemas.js";
import { requireAuth } from "../../http/middleware/authenticate.js";
import { parseUuidParam } from "../../http/validators/shared/common.js";
import { parseCreateSession, parseLock, parseSessionListQuery } from "../../http/validators/teacher/session.js";
import type { TeacherSessionService } from "../../services/teacher/session.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteGroup } from "../types.js";

const SESSION_NOT_FOUND = errorDoc("session_not_found", "Session not found, or it belongs to another teacher.", "Session not found");
const SESSION_ENDED = errorDoc("session_ended", "The session has already ended.", "The session has ended");

export function teacherSessionRoutes(service: TeacherSessionService): RouteGroup {
  const idOf = (req: { params: Record<string, unknown> }) => parseUuidParam(req.params.id, "id");

  return {
    role: "teacher",
    feature: "sessions",
    description:
      "Run a live class session with a PIN (like Kahoot) and read attendance. " +
      "Flow: `POST /sessions` → students `POST /sessions/join` → everyone opens `GET /sessions/{id}/events` → start / lock / end.",
    routes: [
      {
        method: "get",
        path: "/sessions",
        access: "staff",
        handler: async (req, res) => {
          parseSessionListQuery(req.query);
          res.json(await service.listLiveSessions(requireAuth(req)));
        },
        doc: {
          summary: "My live sessions",
          description:
            "Sessions that have not ended (LOBBY or ACTIVE), newest first, with the class name and how many students are in. " +
            "A teacher gets their own; an admin gets every teacher's. Use it to find the session to go back to after a page reload.",
          query: [{ name: "status", description: "Required. Only `live` is supported.", schema: { type: "string", enum: ["live"] } }],
          responses: { 200: { description: "The live sessions", schema: ref("LiveSessionList") } },
        },
      },
      {
        method: "post",
        path: "/sessions",
        access: "staff",
        handler: async (req, res) => {
          const { classCode } = parseCreateSession(req.body);
          res.status(201).json(await service.createSession(requireAuth(req), classCode));
        },
        doc: {
          summary: "Start a live session",
          description:
            "Creates a session for one of the teacher's classes and returns its 6-digit PIN (`session.join_code`). " +
            "A class can have only one live session at a time. The session closes by itself after its time limit.",
          requestBody: { schema: ref("CreateSessionRequest"), example: { class_code: "KELAS7A" } },
          responses: {
            201: { description: "Session created, status LOBBY", schema: ref("SessionDetail") },
            404: errorDoc("class_not_found", "No such class, or it belongs to another teacher.", "Class not found"),
            409: errorDoc("session_already_active", "The class already has a live session (`details.session_id`), or the class is archived.", "This class already has a live session"),
          },
        },
      },
      {
        method: "get",
        path: "/sessions/:id",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.getSession(requireAuth(req), idOf(req)));
        },
        doc: {
          summary: "Session with its participants",
          responses: {
            200: { description: "The session and everyone who joined", schema: ref("SessionDetail") },
            404: SESSION_NOT_FOUND,
          },
        },
      },
      {
        method: "post",
        path: "/sessions/:id/start",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.startSession(requireAuth(req), idOf(req)));
        },
        doc: {
          summary: "Start the session (LOBBY → ACTIVE)",
          description: "Students who join after this are marked `late` in the attendance report.",
          responses: {
            200: { description: "Started", schema: ref("SessionResponse") },
            404: SESSION_NOT_FOUND,
            409: errorDoc("session_already_started", "Already started (`session_already_started`) or ended (`session_ended`).", "The session has already started"),
          },
        },
      },
      {
        method: "post",
        path: "/sessions/:id/lock",
        access: "staff",
        handler: async (req, res) => {
          const { locked } = parseLock(req.body);
          res.json(await service.setLocked(requireAuth(req), idOf(req), locked));
        },
        doc: {
          summary: "Lock or unlock joining",
          description: "Locked: new students are refused (`session_locked`). Students already in can still come back.",
          requestBody: { schema: ref("LockRequest"), example: { locked: true } },
          responses: {
            200: { description: "Updated (nothing changes if it was already in that state)", schema: ref("SessionResponse") },
            404: SESSION_NOT_FOUND,
            409: SESSION_ENDED,
          },
        },
      },
      {
        method: "post",
        path: "/sessions/:id/end",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.endSession(requireAuth(req), idOf(req)));
        },
        doc: {
          summary: "End the session",
          description: "The PIN stops working, every stream is closed, and the attendance report is returned.",
          responses: {
            200: { description: "Ended, with the final attendance", schema: ref("EndSessionResponse") },
            404: SESSION_NOT_FOUND,
            409: SESSION_ENDED,
          },
        },
      },
      {
        method: "delete",
        path: "/sessions/:id/participants/:studentId",
        access: "staff",
        handler: async (req, res) => {
          const studentId = parseUuidParam(req.params.studentId, "studentId");
          res.json(await service.kickParticipant(requireAuth(req), idOf(req), studentId));
        },
        doc: {
          summary: "Remove a student from the session",
          description: "The student's stream is closed and they cannot join this session again.",
          responses: {
            200: { description: "Removed (also when already removed)", schema: ref("ParticipantResponse") },
            404: errorDoc("participant_not_found", "Unknown session, or that student is not in it.", "That student is not in this session"),
            409: SESSION_ENDED,
          },
        },
      },
      {
        method: "get",
        path: "/sessions/:id/attendance",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.getAttendance(requireAuth(req), idOf(req)));
        },
        doc: {
          summary: "Attendance report",
          description:
            "Every student of the class with a status: `present`, `late` (joined after Start), `absent` or `kicked`. Works while the session is live and after it ended.",
          responses: {
            200: { description: "The report", schema: ref("Attendance") },
            404: SESSION_NOT_FOUND,
          },
        },
      },
    ],
  };
}

import { AppError } from "../../http/errors.js";
import type { AuthContext } from "../../types/auth.types.js";
import type { ParticipantRecord } from "../../types/shared/session.types.js";
import type { StudentSessionRepository } from "../../types/student/session.types.js";
import type { SessionCore } from "../shared/session-core.js";
import {
  sessionNotFound,
  toParticipantView,
  toStudentSessionView,
  type ParticipantView,
  type StudentSessionView,
} from "../shared/session-views.js";

export interface JoinResult {
  session: StudentSessionView;
  participant: ParticipantView;
}

/** What a student does with a live session: enter the PIN. Following it live is the shared event stream. */
export interface StudentSessionService {
  joinSession(auth: AuthContext, code: string): Promise<JoinResult>;
}

export function createStudentSessionService(repository: StudentSessionRepository, core: SessionCore): StudentSessionService {
  const { options, hub, sessions } = core;

  return {
    async joinSession(auth, code) {
      const classId = await repository.findStudentClassId(auth.userId);
      if (!classId) throw new AppError(401, "invalid_token", "Invalid or expired token");

      // Unknown, ended and expired PINs all look the same.
      const found = await repository.findSessionByCode(code);
      if (!found) throw sessionNotFound();
      const session = await core.closeIfExpired(found);
      if (session.status === "ENDED") throw sessionNotFound();

      if (session.classId !== classId) throw new AppError(403, "not_in_class", "You are not a member of this class");

      const existing = await sessions.findParticipant(session.id, auth.userId);
      if (existing?.kickedAt) throw new AppError(403, "kicked", "You were removed from this session");
      // Someone who is already in may come back after a refresh, even when the door is locked.
      if (!existing && session.locked) throw new AppError(403, "session_locked", "The session is locked");

      let participant: ParticipantRecord;
      if (!existing) {
        participant = await repository.addParticipant(session.id, auth.userId, options.now());
      } else if (existing.leftAt) {
        participant = await sessions.updateParticipant(session.id, auth.userId, { leftAt: null });
      } else {
        return { session: toStudentSessionView(session), participant: toParticipantView(existing) };
      }

      hub.publish(session.id, core.joinedEvent(participant, await core.countJoined(session.id)), "staff");
      return { session: toStudentSessionView(session), participant: toParticipantView(participant) };
    },
  };
}

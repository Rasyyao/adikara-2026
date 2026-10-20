/**
 * In-memory publish/subscribe for live sessions. One hub per process; to run several API
 * instances later, put Redis pub/sub behind this same interface.
 */
export type SessionEventType =
  | "snapshot"
  | "participant_joined"
  | "participant_left"
  | "session_started"
  | "session_locked"
  | "session_unlocked"
  | "session_ended"
  | "kicked";

export interface SessionEvent {
  type: SessionEventType;
  data: Record<string, unknown>;
}

/** Who receives an event: everyone in the session, only staff, or one student. */
export type Audience = "all" | "staff" | { studentId: string };

/** Where events go. The HTTP layer implements it with a response stream; tests with an array. */
export interface EventSink {
  send(event: SessionEvent): void;
  close(): void;
}

export type Viewer = { kind: "staff" } | { kind: "student"; studentId: string };

export interface EventHub {
  /** Returns an unsubscribe function. */
  subscribe(sessionId: string, viewer: Viewer, sink: EventSink): () => void;
  publish(sessionId: string, event: SessionEvent, audience: Audience): void;
  /** Closes the sinks of a session (all, or only one student's). */
  close(sessionId: string, studentId?: string): void;
  /** Open streams of this student in this session. */
  countStudent(sessionId: string, studentId: string): number;
}

interface Subscriber {
  viewer: Viewer;
  sink: EventSink;
}

function receives(viewer: Viewer, audience: Audience): boolean {
  if (audience === "all") return true;
  if (audience === "staff") return viewer.kind === "staff";
  return viewer.kind === "student" && viewer.studentId === audience.studentId;
}

export function createEventHub(): EventHub {
  const sessions = new Map<string, Set<Subscriber>>();

  return {
    subscribe(sessionId, viewer, sink) {
      const subscriber: Subscriber = { viewer, sink };
      const set = sessions.get(sessionId) ?? new Set<Subscriber>();
      set.add(subscriber);
      sessions.set(sessionId, set);

      return () => {
        set.delete(subscriber);
        if (set.size === 0 && sessions.get(sessionId) === set) sessions.delete(sessionId);
      };
    },

    publish(sessionId, event, audience) {
      for (const { viewer, sink } of [...(sessions.get(sessionId) ?? [])]) {
        if (!receives(viewer, audience)) continue;
        try {
          sink.send(event);
        } catch {
          // a broken connection must not stop the others from receiving the event
        }
      }
    },

    close(sessionId, studentId) {
      for (const subscriber of [...(sessions.get(sessionId) ?? [])]) {
        const { viewer, sink } = subscriber;
        if (studentId !== undefined && !(viewer.kind === "student" && viewer.studentId === studentId)) continue;
        sessions.get(sessionId)?.delete(subscriber);
        try {
          sink.close();
        } catch {
          // already closed
        }
      }
      if (sessions.get(sessionId)?.size === 0) sessions.delete(sessionId);
    },

    countStudent(sessionId, studentId) {
      let count = 0;
      for (const { viewer } of sessions.get(sessionId) ?? []) {
        if (viewer.kind === "student" && viewer.studentId === studentId) count += 1;
      }
      return count;
    },
  };
}

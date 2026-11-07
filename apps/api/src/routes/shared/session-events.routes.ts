import type { Response } from "express";
import { ref } from "../../docs/schemas.js";
import { requireAuth } from "../../http/middleware/authenticate.js";
import { parseUuidParam } from "../../http/validators/shared/common.js";
import type { SessionEvent } from "../../lib/event-hub.js";
import type { LiveBoardService } from "../../services/shared/live-board.service.js";
import type { SessionStreamService } from "../../services/shared/session-stream.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteGroup } from "../types.js";
import { liveBoardRoute } from "./live-board.routes.js";

const HEARTBEAT_MS = 25_000;
/** A client this far behind (bytes waiting in memory) no longer gets cursor moves, which the next one replaces anyway. */
const SKIP_CURSORS_AT = 256 * 1024;
/** A client this far behind is cut off; its browser reconnects and starts again from a fresh snapshot. */
const DROP_CLIENT_AT = 4 * 1024 * 1024;

function writeEvent(res: Response, event: SessionEvent): void {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}

const SSE_EXAMPLE = [
  "event: snapshot",
  'data: {"session":{"id":"…","status":"LOBBY","locked":false,"join_code":"482913"},"participants":[]}',
  "",
  "event: participant_joined",
  'data: {"student_id":"…","name":"Siswa Satu","state":"joined","participant_count":1}',
  "",
].join("\n");

export function sessionEventsRoutes(service: SessionStreamService, liveBoard: LiveBoardService): RouteGroup {
  return {
    role: "shared",
    feature: "sessions",
    description: "The live event stream of a session, and the whiteboard drawn on together, for the teacher who runs it and the students who joined.",
    routes: [
      liveBoardRoute(liveBoard),
      {
        method: "get",
        path: "/sessions/:id/events",
        access: "authenticated",
        handler: async (req, res) => {
          const sessionId = parseUuidParam(req.params.id, "id");
          // the client may leave while the snapshot is still being read: remember it, so its subscription is not kept forever
          let gone = false;
          let cleanup: (() => void) | null = null;
          res.on("close", () => {
            gone = true;
            cleanup?.();
          });
          const open = () => !gone && !res.writableEnded && !res.destroyed;

          const stream = await service.subscribe(requireAuth(req), sessionId, {
            send: (event) => {
              if (!open()) return;
              const behind = res.writableLength;
              if (behind > DROP_CLIENT_AT) {
                res.destroy();
                return;
              }
              if (event.type === "cursor" && behind > SKIP_CURSORS_AT) return;
              writeEvent(res, event);
            },
            close: () => {
              if (open()) res.end();
            },
          });
          if (!open()) {
            stream.unsubscribe();
            return;
          }

          res.status(200).set({
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no", // tell nginx not to buffer
          });
          res.flushHeaders();
          writeEvent(res, stream.snapshot);

          if (stream.ended) {
            res.end();
            return;
          }

          const heartbeat = setInterval(() => {
            if (open()) res.write(": ping\n\n");
          }, HEARTBEAT_MS);
          cleanup = () => {
            cleanup = null;
            clearInterval(heartbeat);
            stream.unsubscribe();
          };
          stream.activate();
        },
        doc: {
          summary: "Live events (Server-Sent Events)",
          description:
            "A long-lived `text/event-stream`. The first event is always `snapshot` with the current state, so a refresh loses nothing.\n\n" +
            "| Event | Sent to | Meaning |\n|---|---|---|\n" +
            "| `snapshot` | the new connection | current state (teachers also get the participant list) |\n" +
            "| `participant_joined` | teachers | a student joined or came back |\n" +
            "| `participant_left` | teachers | a student dropped (`disconnected`) or was removed (`kicked`) |\n" +
            "| `session_started` | everyone | the teacher pressed Start |\n" +
            "| `session_locked` / `session_unlocked` | everyone | joining was locked or reopened |\n" +
            "| `session_ended` | everyone | the session ended; the stream closes |\n" +
            "| `kicked` | that student | removed by the teacher; the stream closes |\n\n" +
            "Teachers can follow only their own sessions (admins any). Students can follow only a session they joined. " +
            "Browsers' `EventSource` cannot send the `Authorization` header, so read the stream with `fetch` (or `@microsoft/fetch-event-source`). " +
            "Swagger UI cannot display a stream; try it with `curl -N -H \"Authorization: Bearer <token>\" …/sessions/{id}/events`.",
          responses: {
            200: {
              description: "The event stream",
              contentType: "text/event-stream",
              schema: { type: "string" },
              example: SSE_EXAMPLE,
            },
            403: errorDoc("not_joined", "A student who has not joined (`not_joined`) or was removed (`kicked`).", "Join the session with its PIN first"),
            404: errorDoc("session_not_found", "Session not found, or it belongs to another teacher.", "Session not found"),
          },
        },
      },
    ],
  };
}

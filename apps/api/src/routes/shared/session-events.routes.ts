import type { Response } from "express";
import { ref } from "../../docs/schemas.js";
import { requireAuth } from "../../http/middleware/authenticate.js";
import { parseUuidParam } from "../../http/validators/shared/common.js";
import type { SessionEvent } from "../../lib/event-hub.js";
import type { SessionStreamService } from "../../services/shared/session-stream.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteGroup } from "../types.js";

const HEARTBEAT_MS = 25_000;

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

export function sessionEventsRoutes(service: SessionStreamService): RouteGroup {
  return {
    role: "shared",
    feature: "sessions",
    description: "The live event stream of a session, for the teacher who runs it and the students who joined.",
    routes: [
      {
        method: "get",
        path: "/sessions/:id/events",
        access: "authenticated",
        handler: async (req, res) => {
          const sessionId = parseUuidParam(req.params.id, "id");
          const stream = await service.subscribe(requireAuth(req), sessionId, {
            send: (event) => writeEvent(res, event),
            close: () => res.end(),
          });

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

          const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
          res.on("close", () => {
            clearInterval(heartbeat);
            stream.unsubscribe();
          });
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

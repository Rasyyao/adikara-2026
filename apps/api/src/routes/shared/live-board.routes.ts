import { requireAuth } from "../../http/middleware/authenticate.js";
import { parseUuidParam } from "../../http/validators/shared/common.js";
import { parseLiveInput } from "../../http/validators/shared/live-board.js";
import type { LiveBoardService } from "../../services/shared/live-board.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteDefinition } from "../types.js";

/** The whiteboard the teacher and the students of a live session draw on together; part of the session's live group. */
export function liveBoardRoute(service: LiveBoardService): RouteDefinition {
  return {
        method: "post",
        path: "/sessions/:id/live",
        access: "authenticated",
        handler: async (req, res) => {
          const sessionId = parseUuidParam(req.params.id, "id");
          res.json(await service.apply(requireAuth(req), sessionId, parseLiveInput(req.body)));
        },
        doc: {
          summary: "Draw on the shared whiteboard, or move your cursor",
          description:
            "Send what changed on the board (`upserts`: whole elements, `deletes`: ids), where your pointer is (`cursor`, board " +
            "coordinates; `null` when it left the board), and, as the teacher, whether students may draw (`draw_allowed`). " +
            "Everyone else receives it on `GET /sessions/{id}/events`:\n\n" +
            "| Event | Sent to | Meaning |\n|---|---|---|\n" +
            "| `board_ops` | everyone | `{ by, upserts, deletes }` |\n" +
            "| `cursor` | everyone for the teacher's, teachers for a student's | `{ id, name, role, x, y }` or `{ id, hidden: true }` |\n" +
            "| `board_mode` | everyone | `{ draw_allowed }` |\n\n" +
            "The stream's `snapshot` carries the board as `live: { board, draw_allowed, me }`. A student may only change what they " +
            "drew, only while the session is ACTIVE and drawing is allowed; refused changes come back in `revert` for the client to undo.",
          requestBody: {
            schema: { type: "object", properties: { upserts: { type: "array", items: { type: "object" } }, deletes: { type: "array", items: { type: "string" } }, cursor: { type: "object", nullable: true }, draw_allowed: { type: "boolean" } } },
            example: { cursor: { x: 120, y: 340 } },
          },
          responses: {
            200: { description: "Applied; what the client must undo", schema: { type: "object", properties: { revert: { type: "object" } } } },
            403: errorDoc("not_joined", "A student who has not joined or was removed, or a student changing who may draw.", "Join the session with its PIN first"),
            404: errorDoc("session_not_found", "Session not found, or it belongs to another teacher.", "Session not found"),
            409: errorDoc("session_ended", "The session has ended.", "The session has ended"),
          },
        },
      };
}

import { asRecord, validationError } from "./common.js";
import type { LiveInput } from "../../../types/shared/live-board.types.js";

/** Elements one message may change: a drag of a large selection, or a pasted diagram. */
const MAX_UPSERTS = 600;
const MAX_DELETES = 600;
/** Scene coordinates far beyond anything drawn are a broken client, not a cursor. */
const MAX_COORD = 1e7;

const isCoord = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_COORD;

/** One message of a live board: changed elements, deleted ids, the sender's cursor, and (teacher) whether students may draw. */
export function parseLiveInput(body: unknown): LiveInput {
  const record = asRecord(body);
  const input: LiveInput = {};

  if (record.upserts !== undefined) {
    if (!Array.isArray(record.upserts)) throw validationError({ upserts: "must be a list" });
    if (record.upserts.length > MAX_UPSERTS) throw validationError({ upserts: `must have at most ${MAX_UPSERTS} elements` });
    input.upserts = record.upserts.map((element) => {
      if (typeof element !== "object" || element === null || Array.isArray(element)) throw validationError({ upserts: "every element must be an object" });
      const item = element as Record<string, unknown>;
      if (typeof item.id !== "string" || item.id.length > 64 || typeof item.type !== "string") throw validationError({ upserts: "every element needs a string id and type" });
      return item;
    });
  }

  if (record.deletes !== undefined) {
    if (!Array.isArray(record.deletes) || record.deletes.some((id) => typeof id !== "string" || id.length > 64)) throw validationError({ deletes: "must be a list of ids" });
    if (record.deletes.length > MAX_DELETES) throw validationError({ deletes: `must have at most ${MAX_DELETES} ids` });
    input.deletes = record.deletes as string[];
  }

  if (record.cursor !== undefined) {
    if (record.cursor === null) input.cursor = null;
    else {
      const cursor = record.cursor as Record<string, unknown>;
      if (typeof cursor !== "object" || Array.isArray(cursor) || !isCoord(cursor.x) || !isCoord(cursor.y)) throw validationError({ cursor: "needs numeric x and y" });
      input.cursor = { x: cursor.x, y: cursor.y };
    }
  }

  if (record.draw_allowed !== undefined) {
    if (typeof record.draw_allowed !== "boolean") throw validationError({ draw_allowed: "must be true or false" });
    input.drawAllowed = record.draw_allowed;
  }

  return input;
}

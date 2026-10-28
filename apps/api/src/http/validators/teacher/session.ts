import type { BoardScene } from "../../../types/teacher/session.types.js";
import { asRecord, validationError } from "../shared/common.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLASS_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

/** `chat_id` may be absent or null (no material); otherwise it must be a UUID. */
function parseOptionalChatId(record: Record<string, unknown>): string | null {
  const value = record.chat_id;
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw validationError({ chat_id: "must be a UUID or null" });
  return value.toLowerCase();
}

export function parseCreateSession(body: unknown): { classCode: string; chatId: string | null } {
  const record = asRecord(body);
  const classCode = typeof record.class_code === "string" ? record.class_code.trim().toUpperCase() : "";
  if (!CLASS_CODE_PATTERN.test(classCode)) {
    throw validationError({ class_code: "must be 3-32 characters: letters, digits, dash or underscore" });
  }
  return { classCode, chatId: parseOptionalChatId(record) };
}

/** The material to assign to a session; `null` removes it. The key itself is required, so an empty body is not a silent unassign. */
export function parseAssignMaterial(body: unknown): { chatId: string | null } {
  const record = asRecord(body);
  if (!("chat_id" in record)) throw validationError({ chat_id: "is required (a UUID, or null to remove the material)" });
  return { chatId: parseOptionalChatId(record) };
}

/** `?status=live` is the only filter so far. It is required, so a later `ended` history can be added without changing meaning. */
export function parseSessionListQuery(query: Record<string, unknown>): { status: "live" } {
  const raw = Array.isArray(query.status) ? query.status[query.status.length - 1] : query.status;
  if (raw !== "live") throw validationError({ status: "must be 'live'" });
  return { status: "live" };
}

export function parseLock(body: unknown): { locked: boolean } {
  const record = asRecord(body);
  if (typeof record.locked !== "boolean") throw validationError({ locked: "must be true or false" });
  return { locked: record.locked };
}

export const MAX_BOARD_ELEMENTS = 5000;

/**
 * A whiteboard scene from the editor. Only what is needed to draw it again is kept: the elements (each needs an id and a type)
 * and the background colour. Everything else in `appState` is the editor's own state (zoom, selection, open menus) and is dropped.
 */
export function parseBoardScene(body: unknown): BoardScene {
  const record = asRecord(body);
  if (!Array.isArray(record.elements)) throw validationError({ elements: "must be a list" });
  if (record.elements.length > MAX_BOARD_ELEMENTS) throw validationError({ elements: `must have at most ${MAX_BOARD_ELEMENTS} elements` });
  const elements: Record<string, unknown>[] = [];
  for (const element of record.elements) {
    if (typeof element !== "object" || element === null || Array.isArray(element)) throw validationError({ elements: "every element must be an object" });
    const item = element as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.type !== "string") throw validationError({ elements: "every element needs a string id and type" });
    elements.push(item);
  }
  const appState = typeof record.appState === "object" && record.appState !== null && !Array.isArray(record.appState) ? (record.appState as Record<string, unknown>) : {};
  const color = appState.viewBackgroundColor;
  if (color !== undefined && (typeof color !== "string" || color.length > 32)) throw validationError({ appState: "viewBackgroundColor must be a short string" });
  return { elements, appState: color === undefined ? {} : { viewBackgroundColor: color } };
}

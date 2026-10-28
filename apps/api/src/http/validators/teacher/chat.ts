import { extname } from "node:path";
import { asRecord, throwIfInvalid, validationError, type Fields } from "../shared/common.js";

export const MAX_MESSAGE_CHARS = 4000;
const MAX_TITLE_CHARS = 100;

/** The kinds of material the pipeline can read. Each is checked by extension and by the file's first bytes. */
const FILE_KINDS: Record<string, { contentType: string; magic: Buffer }> = {
  ".pdf": { contentType: "application/pdf", magic: Buffer.from("%PDF-") },
  ".docx": {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    magic: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  },
  ".pptx": {
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    magic: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  },
};
export const ALLOWED_EXTENSIONS = Object.keys(FILE_KINDS);

// Message text may hold line breaks and tabs; titles (of chats and files) may not hold any control character.
// eslint-disable-next-line no-control-regex
const TEXT_CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const TITLE_CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function parseCreateChat(body: unknown): { title: string | null } {
  const record = asRecord(body ?? {});
  if (record.title === undefined || record.title === null || record.title === "") return { title: null };
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (title.length < 1 || title.length > MAX_TITLE_CHARS || TITLE_CONTROL_CHARS.test(title)) {
    throw validationError({ title: `must be 1-${MAX_TITLE_CHARS} characters, without control characters` });
  }
  return { title };
}

/** The text of a message. It arrives as a JSON field or as a multipart field, so the body may be missing entirely. */
export function parseMessageText(body: unknown): string {
  const fields: Fields = {};
  const record = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (text.length === 0) fields.text = "is required";
  else if (text.length > MAX_MESSAGE_CHARS) fields.text = `must be at most ${MAX_MESSAGE_CHARS} characters`;
  else if (TEXT_CONTROL_CHARS.test(text)) fields.text = "must not contain control characters";
  throwIfInvalid(fields);
  return text;
}

export const MAX_EDITED_CONTENT_CHARS = 100_000;

/** The new content of an assistant reply the teacher edited (a mindmap is a long JSON block, so the limit is generous). */
export function parseEditedContent(body: unknown): string {
  const fields: Fields = {};
  const record = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const content = typeof record.content === "string" ? record.content.trim() : "";
  if (content.length === 0) fields.content = "is required";
  else if (content.length > MAX_EDITED_CONTENT_CHARS) fields.content = `must be at most ${MAX_EDITED_CONTENT_CHARS} characters`;
  else if (TEXT_CONTROL_CHARS.test(content)) fields.content = "must not contain control characters";
  throwIfInvalid(fields);
  return content;
}

export interface ValidFile {
  title: string;
  extension: string;
  contentType: string;
  buffer: Buffer;
}

/** Checks an uploaded file; returns null when there is none (the file is optional). */
export function parseOptionalFile(file: { originalname: string; buffer: Buffer } | undefined): ValidFile | null {
  if (!file) return null;
  const extension = extname(file.originalname).toLowerCase();
  const kind = FILE_KINDS[extension];
  if (!kind) throw validationError({ file: `must be one of: ${ALLOWED_EXTENSIONS.join(", ")}` });
  if (file.buffer.length === 0) throw validationError({ file: "is empty" });
  // a renamed file (a script called .pdf, a zip called .docx) is turned away here, before it reaches storage
  if (!file.buffer.subarray(0, kind.magic.length).equals(kind.magic)) {
    throw validationError({ file: `is not a valid ${extension.slice(1).toUpperCase()} file` });
  }
  const base = file.originalname.slice(0, file.originalname.length - extension.length);
  const title = base.replace(new RegExp(TITLE_CONTROL_CHARS, "g"), "").trim().slice(0, MAX_TITLE_CHARS) || "Untitled";
  return { title, extension, contentType: kind.contentType, buffer: file.buffer };
}

/** `?limit=50&after=<message id>` to poll a chat. */
export function parseMessageQuery(query: Record<string, unknown>): { limit: number; after?: string } {
  const fields: Fields = {};
  const single = (value: unknown) => (Array.isArray(value) ? value[value.length - 1] : value);

  let limit = 50;
  const rawLimit = single(query.limit);
  if (rawLimit !== undefined && rawLimit !== "") {
    const n = typeof rawLimit === "string" && /^\d+$/.test(rawLimit) ? Number(rawLimit) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 200) fields.limit = "must be an integer between 1 and 200";
    else limit = n;
  }

  let after: string | undefined;
  const rawAfter = single(query.after);
  if (rawAfter !== undefined && rawAfter !== "") {
    if (typeof rawAfter === "string" && /^[0-9a-f-]{36}$/i.test(rawAfter)) after = rawAfter.toLowerCase();
    else fields.after = "must be a message id";
  }
  throwIfInvalid(fields);
  return { limit, after };
}

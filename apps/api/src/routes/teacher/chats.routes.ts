import type { Request, RequestHandler } from "express";
import { ref } from "../../docs/schemas.js";
import { requireAuth } from "../../http/middleware/authenticate.js";
import { parseUuidParam } from "../../http/validators/shared/common.js";
import { parseCreateChat, parseMessageQuery, parseMessageText, parseOptionalFile } from "../../http/validators/teacher/chat.js";
import { subscribeChatEvents } from "../../lib/chat-events.js";
import type { TeacherChatService } from "../../services/teacher/chat.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteGroup } from "../types.js";

const HEARTBEAT_MS = 25_000;

const FILE_CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function teacherChatRoutes(service: TeacherChatService, upload: RequestHandler): RouteGroup {
  const chatId = (req: Request) => parseUuidParam(req.params.id, "id");

  return {
    role: "teacher",
    feature: "chats",
    description:
      "A teacher's chats with the AI. Send text, and optionally a PDF/DOCX/PPTX: the file is stored, read by the worker, and used " +
      "by this chat only. The AI's reply is written by the worker, so poll `GET /chats/{id}/messages` until `reply_pending` is false.",
    routes: [
      {
        method: "post",
        path: "/chats",
        access: "staff",
        handler: async (req, res) => {
          res.status(201).json(await service.create(requireAuth(req), parseCreateChat(req.body)));
        },
        doc: {
          summary: "Start a chat",
          requestBody: { schema: ref("CreateChatRequest"), example: { title: "Persiapan kelas 7A" } },
          responses: { 201: { description: "The new chat", schema: ref("ChatResponse") } },
        },
      },
      {
        method: "get",
        path: "/chats",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.list(requireAuth(req)));
        },
        doc: {
          summary: "My chats",
          description: "Newest first. An admin sees every chat.",
          responses: { 200: { description: "The chats", schema: ref("ChatList") } },
        },
      },
      {
        method: "get",
        path: "/chats/:id",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.get(requireAuth(req), chatId(req)));
        },
        doc: {
          summary: "A chat with its materials",
          description: "Each material shows whether the worker has read it yet (`status`) and why it failed (`error`).",
          responses: {
            200: { description: "The chat and its materials", schema: ref("ChatDetail") },
            404: errorDoc("chat_not_found", "No such chat, or it belongs to another teacher.", "Chat not found"),
          },
        },
      },
      {
        method: "post",
        path: "/chats/:id/stop",
        access: "staff",
        handler: async (req, res) => {
          await service.stopReply(requireAuth(req), chatId(req));
          res.status(204).end();
        },
        doc: {
          summary: "Stop the AI reply",
          description:
            "Cancels the reply that is being written. Nothing is saved for it, so `reply_pending` turns false. " +
            "Does nothing when no reply is pending.",
          responses: {
            204: { description: "Stopped (or nothing was pending)" },
            404: errorDoc("chat_not_found", "No such chat, or it belongs to another teacher.", "Chat not found"),
          },
        },
      },
      {
        method: "delete",
        path: "/chats/:id",
        access: "staff",
        handler: async (req, res) => {
          await service.remove(requireAuth(req), chatId(req));
          res.status(204).end();
        },
        doc: {
          summary: "Delete a chat",
          description:
            "Deletes the chat with its messages, and the uploaded files no other chat uses (also from storage). " +
            "Class sessions that used the chat are kept.",
          responses: {
            204: { description: "Deleted" },
            404: errorDoc("chat_not_found", "No such chat, or it belongs to another teacher.", "Chat not found"),
          },
        },
      },
      {
        method: "get",
        path: "/chats/:id/messages",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.messages(requireAuth(req), chatId(req), parseMessageQuery(req.query)));
        },
        doc: {
          summary: "Read the conversation",
          description:
            "Without `after`: the latest messages, oldest first. To poll, pass the id of the last message you have as `after` " +
            "and repeat while `reply_pending` is true.",
          query: [
            { name: "limit", description: "1-200, default 50.", schema: { type: "integer", minimum: 1, maximum: 200 } },
            { name: "after", description: "Id of the last message you already have.", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            200: { description: "The messages", schema: ref("ChatMessages") },
            404: errorDoc("chat_not_found", "No such chat, or it belongs to another teacher.", "Chat not found"),
          },
        },
      },
      {
        method: "post",
        path: "/chats/:id/messages",
        access: "staff",
        middleware: [upload],
        handler: async (req, res) => {
          const text = parseMessageText(req.body);
          const file = parseOptionalFile(req.file);
          res.status(202).json(await service.send(requireAuth(req), chatId(req), { text, file }));
        },
        doc: {
          summary: "Send a message (and optionally a file)",
          description:
            "Send `text` as JSON, or as multipart form data together with a `file`. A file is stored and read by the worker, " +
            "then used as knowledge of this chat only. Answers 202 at once: the reply arrives later, see `GET /chats/{id}/messages`. " +
            "If the file cannot be read, the material shows `FAILED` with the reason and the AI says so in its reply.",
          requestBody: {
            contentType: "multipart/form-data",
            schema: ref("SendMessageRequest"),
            description: "Plain `application/json` with only `text` is accepted too.",
          },
          responses: {
            202: { description: "Saved; the reply is being written", schema: ref("SendMessageResult") },
            404: errorDoc("chat_not_found", "No such chat, or it belongs to another teacher.", "Chat not found"),
            413: errorDoc("file_too_large", "The file is larger than the upload limit.", "File is too large (maximum 20 MB)"),
            503: errorDoc("storage_unavailable", "File storage is not configured on this server.", "File storage is not configured"),
          },
        },
      },
      {
        method: "get",
        path: "/chats/:id/materials/:materialId",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.material(requireAuth(req), chatId(req), parseUuidParam(req.params.materialId, "materialId")));
        },
        doc: {
          summary: "A material with its extracted text",
          description: "The text the worker read from the file; `null` until the file has been extracted.",
          responses: {
            200: { description: "The material and its text", schema: { type: "object" } },
            404: errorDoc("material_not_found", "No such material in this chat.", "Material not found"),
          },
        },
      },
      {
        method: "get",
        path: "/chats/:id/materials/:materialId/file",
        access: "staff",
        handler: async (req, res) => {
          const file = await service.materialFile(requireAuth(req), chatId(req), parseUuidParam(req.params.materialId, "materialId"));
          res
            .status(200)
            .set({
              "Content-Type": FILE_CONTENT_TYPES[file.fileType] ?? "application/octet-stream",
              "Content-Length": String(file.body.length),
              "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`${file.title}.${file.fileType}`)}`,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
            })
            .send(file.body);
        },
        doc: {
          summary: "The original file of a material",
          description: "The uploaded PDF/DOCX/PPTX itself, so the teacher can view or download it.",
          responses: {
            200: { description: "The file bytes", contentType: "application/octet-stream", schema: { type: "string", format: "binary" } },
            404: errorDoc("file_not_found", "The material or its stored file does not exist.", "The file is no longer in storage"),
            503: errorDoc("storage_unavailable", "File storage is not configured on this server.", "File storage is not configured"),
          },
        },
      },
      {
        method: "get",
        path: "/chats/:id/events",
        access: "staff",
        handler: async (req, res) => {
          const auth = requireAuth(req);
          const id = chatId(req);

          const fetchSnapshot = async () => {
            const [chatDetail, msgList] = await Promise.all([
              service.get(auth, id),
              service.messages(auth, id, { limit: 100 }),
            ]);
            return {
              materials: chatDetail.materials,
              messages: msgList.items,
              reply_pending: msgList.reply_pending,
            };
          };

          const initial = await fetchSnapshot();

          res.status(200).set({
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          });
          res.flushHeaders();
          res.write(`event: snapshot\ndata: ${JSON.stringify(initial)}\n\n`);

          const unsubscribe = subscribeChatEvents(id, () => {
            void fetchSnapshot()
              .then((payload) => {
                if (!res.writableEnded) {
                  res.write(`event: update\ndata: ${JSON.stringify(payload)}\n\n`);
                }
              })
              .catch(() => {
                // ignore transient read error
              });
          });

          const heartbeat = setInterval(() => {
            if (!res.writableEnded) res.write(": ping\n\n");
          }, HEARTBEAT_MS);

          res.on("close", () => {
            clearInterval(heartbeat);
            unsubscribe();
          });
        },
        doc: {
          summary: "Live chat & material updates (Server-Sent Events)",
          description:
            "A long-lived `text/event-stream` that pushes `snapshot` on connect and `update` whenever the Python worker " +
            "finishes extracting a material or writing an AI reply (`NOTIFY chat_events`).",
          responses: {
            200: {
              description: "The chat event stream",
              contentType: "text/event-stream",
              schema: { type: "string" },
            },
            404: errorDoc("chat_not_found", "No such chat, or it belongs to another teacher.", "Chat not found"),
          },
        },
      },
    ],
  };
}

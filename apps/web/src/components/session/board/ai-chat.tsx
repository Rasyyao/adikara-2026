"use client";

import { ClipboardList, Network, NotebookPen, Plus, Send, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { sendChatMessageAction, stopChatReplyAction } from "@/app/actions/chats";
import { useToast } from "@/components/ui/toast";
import type { MessageView } from "@/lib/api/types";
import { assessmentKindLabel, extractAssessmentsFromContent } from "../../materials/assessment-editor";
import type { MindmapPayload } from "../../materials/mindmap-layout";
import { extractMindmapFromContent } from "../../materials/mindmap-parse";

const QUICK_PROMPTS = [
  { label: "Buat mindmap", text: "Tolong buatkan kerangka mindmap hierarkis (topik utama, sub-topik, dan poin kunci) dari materi ini." },
  { label: "Ringkas materi", text: "Tolong ringkas materi ini dalam poin-poin singkat yang mudah dijelaskan di kelas." },
  { label: "Beri contoh", text: "Berikan satu contoh sederhana yang bisa saya tunjukkan di papan tulis untuk menjelaskan materi ini." },
];

/** Markdown marks would show as stray symbols in a plain text bubble. */
const plain = (text: string) => text.replace(/\*\*/g, "").replace(/^#{1,6}\s+/gm, "").trim();

/**
 * Talks to the AI of the session's material from the whiteboard. It is the same conversation as on the materials page
 * (replies arrive through the same event stream), so the AI answers from the teacher's files.
 */
export function AiChat({
  chatId,
  onAddMindmap,
  onAddNote,
}: {
  chatId: string;
  onAddMindmap: (mindmap: MindmapPayload) => void;
  /** Puts an answer on the board as a text note. */
  onAddNote: (text: string) => void;
}) {
  const toast = useToast();
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const source = new EventSource(`/api/chats/${chatId}/events`);
    const onPayload = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { messages?: MessageView[]; reply_pending?: boolean };
        if (Array.isArray(data.messages)) setMessages(data.messages);
        if (typeof data.reply_pending === "boolean") setThinking(data.reply_pending);
      } catch {
        // a malformed event is skipped
      }
    };
    source.addEventListener("snapshot", onPayload as EventListener);
    source.addEventListener("update", onPayload as EventListener);
    return () => source.close();
  }, [chatId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  async function send(text: string) {
    const value = text.trim();
    if (!value || sending || thinking) return;
    setSending(true);
    const form = new FormData();
    form.set("chat_id", chatId);
    form.set("text", value);
    const result = await sendChatMessageAction(form);
    setSending(false);
    if (!result.ok) return toast.error(result.message);
    setDraft("");
    setMessages((current) => (current.some((m) => m.id === result.message.id) ? current : [...current, result.message]));
    setThinking(result.replyPending);
  }

  async function stop() {
    setThinking(false);
    const result = await stopChatReplyAction(chatId);
    if (!result.ok) toast.error(result.message);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(draft);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 && !thinking && (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-small text-muted">
            <Sparkles size={20} strokeWidth={1.75} className="mx-auto mb-2 text-primary" aria-hidden="true" />
            Tanya AI tentang materi ini. Jawabannya bisa langsung ditaruh di papan.
          </div>
        )}

        {messages.map((message) => {
          if (message.role === "USER") {
            return (
              <div key={message.id} className="ml-8 self-end rounded-lg rounded-br-sm bg-primary-tint px-3 py-2 text-small text-ink">
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            );
          }
          const mindmap = extractMindmapFromContent(message.content);
          const tests = extractAssessmentsFromContent(message.content);
          const text = mindmap ? mindmap.introText : tests ? tests.introText : message.content;
          return (
            <div key={message.id} className="mr-4 flex flex-col gap-2 self-start">
              {text && <p className="whitespace-pre-wrap break-words rounded-lg rounded-bl-sm bg-bg px-3 py-2 text-small text-ink">{plain(text)}</p>}

              {mindmap && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Network size={18} strokeWidth={1.75} className="shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-small font-semibold text-ink">{mindmap.mindmap.title}</p>
                      <p className="text-caption text-muted">{mindmap.mindmap.nodes.length} konsep</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAddMindmap(mindmap.mindmap)}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-caption font-semibold text-white transition-colors hover:bg-primary-hover"
                  >
                    <Plus size={14} strokeWidth={2} aria-hidden="true" />
                    Ke papan
                  </button>
                </div>
              )}

              {tests && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-surface p-3 text-small text-ink">
                  <ClipboardList size={18} strokeWidth={1.75} className="shrink-0 text-primary" aria-hidden="true" />
                  {tests.assessments.map((a) => `${assessmentKindLabel(a.kind)} (${a.questions.length} soal)`).join(" + ")}. Lihat di tab Materi bila sudah disetujui.
                </div>
              )}

              {!mindmap && !tests && (
                <button
                  type="button"
                  onClick={() => onAddNote(plain(message.content))}
                  className="inline-flex min-h-8 items-center gap-1.5 self-start rounded-md px-2 text-caption font-semibold text-primary hover:bg-primary-tint"
                >
                  <NotebookPen size={14} strokeWidth={1.75} aria-hidden="true" />
                  Taruh di papan sebagai catatan
                </button>
              )}
            </div>
          );
        })}

        {thinking && (
          <p role="status" className="flex items-center gap-2 text-small text-muted">
            <Sparkles size={16} strokeWidth={1.75} className="animate-pulse text-primary motion-reduce:animate-none" aria-hidden="true" />
            AI sedang menyusun jawaban…
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt.label}
              type="button"
              disabled={sending || thinking}
              onClick={() => void send(prompt.text)}
              className="rounded-full border border-border px-3 py-1 text-caption font-semibold text-ink transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {prompt.label}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex items-end gap-2">
          <textarea
            aria-label="Pesan untuk AI"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="Tanya sesuatu tentang materi… (Enter untuk kirim)"
            className="min-h-11 flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 text-small text-ink placeholder:text-muted focus:border-primary focus:outline-none"
          />
          {thinking ? (
            <button type="button" onClick={() => void stop()} aria-label="Hentikan balasan" className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border text-ink hover:bg-bg">
              <Square size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={sending || draft.trim().length === 0}
              aria-label="Kirim"
              className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

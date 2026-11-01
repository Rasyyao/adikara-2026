"use client";

import { ClipboardList, GitBranch, Network, NotebookPen, Plus, Send, Sparkles, Square, Workflow } from "lucide-react";
import { useEffect, useRef, useState, type Dispatch, type FormEvent, type KeyboardEvent, type SetStateAction } from "react";
import { sendChatMessageAction, stopChatReplyAction } from "@/app/actions/chats";
import { useToast } from "@/components/ui/toast";
import type { MessageView } from "@/lib/api/types";
import { assessmentKindLabel, extractAssessmentsFromContent } from "../../materials/assessment-editor";
import type { MindmapPayload } from "../../materials/mindmap-layout";
import { extractMindmapFromContent } from "../../materials/mindmap-parse";
import { flowchartOf, hasIfElse } from "./code-flow";
import { codeBlocksOf, isTextDiagram, plain } from "./markdown";
import type { BoardElement } from "./types";
import { extractVisualFromContent, withoutVisualJson } from "./visual";
import { answerIn, VisualAskProvider } from "./visual-ask";
import { VisualCard } from "./visual-card";
import { useSaveVisual } from "./visual-library";
import { displayPrompt, tracePrompt, visualPrompt } from "./visual-prompts";

/** The conversation of a chat, live from its event stream. */
export interface ChatStream {
  messages: MessageView[];
  setMessages: Dispatch<SetStateAction<MessageView[]>>;
  thinking: boolean;
  setThinking: Dispatch<SetStateAction<boolean>>;
  /** False until the first snapshot arrived. */
  loaded: boolean;
}

export function useChatStream(chatId: string | null): ChatStream {
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [thinking, setThinking] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!chatId) return;
    const source = new EventSource(`/api/chats/${chatId}/events`);
    const onPayload = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { messages?: MessageView[]; reply_pending?: boolean };
        if (Array.isArray(data.messages)) setMessages(data.messages);
        if (typeof data.reply_pending === "boolean") setThinking(data.reply_pending);
        setLoaded(true);
      } catch {
        // a malformed event is skipped
      }
    };
    source.addEventListener("snapshot", onPayload as EventListener);
    source.addEventListener("update", onPayload as EventListener);
    return () => source.close();
  }, [chatId]);

  return { messages, setMessages, thinking, setThinking, loaded };
}

const QUICK_PROMPTS = [
  { label: "Buat mindmap", text: "Tolong buatkan kerangka mindmap hierarkis (topik utama, sub-topik, dan poin kunci) dari materi ini." },
  { label: "Ringkas materi", text: "Tolong ringkas materi ini dalam poin-poin singkat yang mudah dijelaskan di kelas." },
  { label: "Simulasi kode", text: tracePrompt("") },
  { label: "Beri contoh", text: "Berikan satu contoh sederhana yang bisa saya tunjukkan di papan tulis untuk menjelaskan materi ini." },
];


/**
 * Talks to the AI of the session's material from the whiteboard. It is the same conversation as on the materials page
 * (replies arrive through the same event stream), so the AI answers from the teacher's files.
 */
export function AiChat({
  chatId,
  stream,
  askRequest,
  onAskSent,
  onAddMindmap,
  onAddNote,
  onAddFlow,
}: {
  chatId: string;
  /** The conversation as it arrives, shared with the panel so a visual saved here is listed there at once. */
  stream: ChatStream;
  /** A mindmap node asked from the board; it is sent as a message once, then `onAskSent` clears it. */
  askRequest: { id: number; text: string } | null;
  onAskSent: () => void;
  onAddMindmap: (mindmap: MindmapPayload) => void;
  /** Puts an answer on the board as a formatted note card. */
  onAddNote: (text: string) => void;
  /** Puts the if / else flowchart of a code answer on the board. */
  onAddFlow: (elements: BoardElement[]) => void;
}) {
  const toast = useToast();
  const { messages, setMessages, thinking, setThinking } = stream;
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const saver = useSaveVisual(chatId, (saved) => setMessages((current) => current.map((m) => (m.id === saved.id ? { ...m, content: saved.content } : m))));

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  /** Sends a message; resolves to its id, or null when it was not sent. */
  async function send(text: string): Promise<string | null> {
    const value = text.trim();
    if (!value || sending || thinking) return null;
    setSending(true);
    const form = new FormData();
    form.set("chat_id", chatId);
    form.set("text", value);
    const result = await sendChatMessageAction(form);
    setSending(false);
    if (!result.ok) {
      toast.error(result.message);
      return null;
    }
    setDraft("");
    setMessages((current) => (current.some((m) => m.id === result.message.id) ? current : [...current, result.message]));
    setThinking(result.replyPending);
    return result.message.id;
  }

  async function stop() {
    setThinking(false);
    const result = await stopChatReplyAction(chatId);
    if (!result.ok) toast.error(result.message);
  }

  // a node asked from the board: send it once, then let the board forget it so a remount does not repeat it
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  const handledAsk = useRef(0);
  useEffect(() => {
    if (!askRequest || askRequest.id === handledAsk.current) return;
    handledAsk.current = askRequest.id;
    if (thinking) toast.error("AI masih menjawab. Coba lagi setelah jawabannya selesai.");
    else void sendRef.current(askRequest.text);
    onAskSent();
  }, [askRequest, thinking, toast, onAskSent]);

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
    <VisualAskProvider
      value={{ ask: (text) => sendRef.current(text), answerTo: (id) => answerIn(messages, id, thinking), busy: sending || thinking, render: (content) => <p className="whitespace-pre-wrap">{plain(content)}</p> }}
    >
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
                  <p className="whitespace-pre-wrap break-words">{displayPrompt(message.content)}</p>
                </div>
              );
            }
            // a visual goes first: its JSON in a ```json fence has "nodes" and would be read as a mindmap
            const visual = extractVisualFromContent(message.content);
            const mindmap = visual ? null : extractMindmapFromContent(message.content);
            const tests = visual ? null : extractAssessmentsFromContent(message.content);
            const text = visual ? visual.introText : mindmap ? mindmap.introText : tests ? tests.introText : withoutVisualJson(message.content);
            const blocks = mindmap || tests || visual ? [] : codeBlocksOf(message.content);
            // a diagram drawn with line characters is not shown (it breaks at any width); the button below draws a real one
            const code = blocks.filter((c) => !isTextDiagram(c.code));
            const textDiagram = blocks.length > code.length;
            const flow = code.filter((c) => hasIfElse(c.code)).map((c) => flowchartOf(c.code)).find((f) => f !== null) ?? null;
            return (
              <div key={message.id} className="mr-4 flex min-w-0 max-w-[calc(100%-1rem)] flex-col gap-2 self-start">
                {text && <p className="whitespace-pre-wrap rounded-lg rounded-bl-sm bg-bg px-3 py-2 text-small text-ink [overflow-wrap:anywhere]">{plain(text)}</p>}

                {visual && (
                  <VisualCard
                    visual={visual.visual}
                    onAdd={onAddFlow}
                    save={{ saved: visual.saved, saving: saver.savingId === message.id, onToggle: () => void saver.toggle(message, visual.saved) }}
                  />
                )}
                {visual?.outroText && <p className="whitespace-pre-wrap rounded-lg rounded-bl-sm bg-bg px-3 py-2 text-small text-ink [overflow-wrap:anywhere]">{plain(visual.outroText)}</p>}

                {code.map((c, index) => (
                  <pre key={index} className="max-w-full overflow-x-auto rounded-md bg-ink px-3 py-2 font-mono text-caption leading-relaxed text-white">
                    <code>{c.code}</code>
                  </pre>
                ))}

                {textDiagram && (
                  <button
                    type="button"
                    disabled={sending || thinking}
                    onClick={() => void send(visualPrompt(plain(message.content).slice(0, 200)))}
                    className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-md bg-primary px-3 text-caption font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Workflow size={14} strokeWidth={2} aria-hidden="true" />
                    Ubah diagram teks jadi diagram di papan
                  </button>
                )}

                {flow && (
                  <button
                    type="button"
                    onClick={() => onAddFlow(flow)}
                    className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-md bg-primary px-3 text-caption font-semibold text-white transition-colors hover:bg-primary-hover"
                  >
                    <GitBranch size={14} strokeWidth={2} aria-hidden="true" />
                    Visualisasikan if / else di papan
                  </button>
                )}

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

                {!mindmap && !tests && !visual && (
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={sending || thinking}
                      onClick={() => void send(visualPrompt(plain(message.content).slice(0, 200)))}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-caption font-semibold text-primary hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Workflow size={14} strokeWidth={1.75} aria-hidden="true" />
                      Visualisasikan jawaban ini
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddNote(message.content)}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-caption font-semibold text-primary hover:bg-primary-tint"
                    >
                      <NotebookPen size={14} strokeWidth={1.75} aria-hidden="true" />
                      Taruh di papan sebagai kartu catatan
                    </button>
                  </div>
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
            <button
              type="button"
              disabled={sending || thinking}
              onClick={() => void send(visualPrompt(draft.trim()))}
              title="Diagram alur, linimasa, atau perbandingan dari pesan yang sedang diketik, atau dari penjelasan terakhir"
              className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary-tint px-3 py-1 text-caption font-semibold text-primary transition-colors hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Workflow size={14} strokeWidth={1.75} aria-hidden="true" />
              Buat visualisasi
            </button>
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
    </VisualAskProvider>
  );
}

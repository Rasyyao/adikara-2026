"use client";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  FileUp,
  FolderOpen,
  Network,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { sendChatMessageAction } from "@/app/actions/chats";
import {
  extractMindmapFromContent,
  MindmapBoard,
  type MindmapPayload,
} from "@/components/materials/mindmap-canvas";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loaders";
import { useToast } from "@/components/ui/toast";
import type { MaterialView, MessageView } from "@/lib/api/types";
import {
  STARTER_PROMPTS,
  TEACHER_CLASSES,
  type ChatMessageItem,
  type ExtractionState,
  type FileKind,
  type MaterialRow,
  type MaterialSource,
} from "@/lib/dummy/teacher";
import { isUuid } from "@/lib/validation/auth";

const ALLOWED_EXTENSIONS: Record<string, FileKind> = {
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1).replace(".", ",")} MB`;
}

function formatTimeFromIso(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toFileKind(raw: string): FileKind {
  const upper = raw.toUpperCase();
  if (upper === "DOCX" || upper === "PPTX") return upper;
  return "PDF";
}

function mapApiMaterial(item: MaterialView, fallbackSize = "Berkas"): MaterialSource {
  return {
    id: item.id,
    title: item.title,
    fileType: toFileKind(item.file_type),
    sizeLabel: fallbackSize,
    status: item.status,
    error: item.error ?? undefined,
  };
}

function mapApiMessage(item: MessageView, attachment?: MaterialSource): ChatMessageItem {
  return {
    id: item.id,
    role: item.role,
    content: item.content,
    createdAt: formatTimeFromIso(item.created_at),
    attachment,
    sources: item.sources ?? undefined,
  };
}

const LATEX_SYMBOLS: Array<[RegExp, string]> = [
  [/\\(?:ge|geq)\b/g, "≥"],
  [/\\(?:le|leq)\b/g, "≤"],
  [/\\(?:ne|neq)\b/g, "≠"],
  [/\\approx\b/g, "≈"],
  [/\\equiv\b/g, "≡"],
  [/\\times\b/g, "×"],
  [/\\cdot\b/g, "·"],
  [/\\div\b/g, "÷"],
  [/\\pm\b/g, "±"],
  [/\\(?:to|rightarrow)\b/g, "→"],
  [/\\leftarrow\b/g, "←"],
  [/\\Rightarrow\b/g, "⇒"],
  [/\\Leftarrow\b/g, "⇐"],
  [/\\leftrightarrow\b/g, "↔"],
  [/\\infty\b/g, "∞"],
  [/\\(?:dots|ldots|cdots)\b/g, "…"],
  [/\\in\b/g, "∈"],
  [/\\notin\b/g, "∉"],
  [/\\subseteq\b/g, "⊆"],
  [/\\subset\b/g, "⊂"],
  [/\\cup\b/g, "∪"],
  [/\\cap\b/g, "∩"],
  [/\\forall\b/g, "∀"],
  [/\\exists\b/g, "∃"],
  [/\\alpha\b/g, "α"],
  [/\\beta\b/g, "β"],
  [/\\gamma\b/g, "γ"],
  [/\\delta\b/g, "δ"],
  [/\\pi\b/g, "π"],
  [/\\theta\b/g, "θ"],
  [/\\lambda\b/g, "λ"],
  [/\\mu\b/g, "μ"],
  [/\\sigma\b/g, "σ"],
  [/\\omega\b/g, "ω"],
];

/** Converts LaTeX math snippets like `\text{pear} \mathrel{+}= 6;` or `i \ge 1` into clean readable text. */
function formatLatexMath(raw: string): string {
  let out = raw.trim();
  // Unwrap nested \text{...}, \mathrel{...}, \mathrm{...}, etc.
  for (let i = 0; i < 4; i++) {
    const next = out
      .replace(/\\(?:text|textrm|textbf|textit|texttt|mathrm|mathbf|mathit|mathtt|mathsf|mathrel|mathbin|mathop|mathord)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1) / ($2)")
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
    if (next === out) break;
    out = next;
  }
  for (const [pattern, replacement] of LATEX_SYMBOLS) {
    out = out.replace(pattern, replacement);
  }
  out = out
    .replace(/\\(?:left|right)\b/g, "")
    .replace(/\\(?:quad|qquad|,|;|:|!)/g, " ")
    .replace(/\\([{}%&_#$])/g, "$1")
    .replace(/\\[a-zA-Z]+\b/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+([+=<>!*/%&|^~-]=)/g, " $1")
    .replace(/([+=<>!*/%&|^~-])\s+=/g, "$1=")
    .replace(/\s{2,}/g, " ")
    .trim();
  return out;
}

/** Strips any stray unmatched markdown asterisks from plain text segments. */
function stripStrayAsterisks(value: string): string {
  return value.replace(/\*\*+/g, "").replace(/(^|[\s(])\*+(?=\S)|(?<=\S)\*+(?=[\s).,;:!?]|$)/g, "$1");
}

function FormattedInline({ text }: { text: string }) {
  const tokenRegex =
    /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\*\*[\s\S]+?\*\*|`[^`]+`|\$(?!\s)[^$\n]+?(?<!\s)\$|\\\([\s\S]+?\\\)|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*[^*\n]+\*)/g;
  const parts = text.split(tokenRegex);

  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;

        if ((part.startsWith("$$") && part.endsWith("$$")) || (part.startsWith("\\[") && part.endsWith("\\]"))) {
          const inner = part.slice(2, -2);
          return (
            <code
              key={index}
              className="mx-0.5 rounded-sm border border-border bg-bg px-2 py-0.5 font-mono text-small font-medium text-ink"
            >
              {formatLatexMath(inner)}
            </code>
          );
        }

        if ((part.startsWith("$") && part.endsWith("$") && part.length > 2) || (part.startsWith("\\(") && part.endsWith("\\)"))) {
          const inner = part.startsWith("\\(") ? part.slice(2, -2) : part.slice(1, -1);
          return (
            <code
              key={index}
              className="rounded-sm border border-border bg-bg px-1.5 py-0.5 font-mono text-caption font-medium text-ink"
            >
              {formatLatexMath(inner)}
            </code>
          );
        }

        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          const inner = part.slice(2, -2);
          return (
            <strong key={index} className="font-semibold text-ink">
              <FormattedInline text={inner} />
            </strong>
          );
        }

        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code
              key={index}
              className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-caption text-primary"
            >
              {part.slice(1, -1)}
            </code>
          );
        }

        const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
        if (linkMatch) {
          return (
            <a
              key={index}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline hover:text-primary-hover"
            >
              {stripStrayAsterisks(linkMatch[1])}
            </a>
          );
        }

        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          const inner = part.slice(1, -1);
          return (
            <em key={index} className="italic text-ink">
              <FormattedInline text={inner} />
            </em>
          );
        }

        return <span key={index}>{stripStrayAsterisks(part)}</span>;
      })}
    </>
  );
}

type ListEntry = {
  ordered: boolean;
  indent: number;
  lines: string[];
};

function renderListItemLines(lines: string[], keyPrefix: string) {
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (
      (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) ||
      (trimmed.startsWith("\\[") && trimmed.endsWith("\\]") && trimmed.length > 4)
    ) {
      return (
        <div
          key={`${keyPrefix}-math-${idx}`}
          className="my-1.5 overflow-x-auto rounded-md border border-border bg-bg px-3.5 py-2 font-mono text-small font-medium text-ink"
        >
          {formatLatexMath(trimmed.slice(2, -2))}
        </div>
      );
    }
    return (
      <div key={`${keyPrefix}-line-${idx}`} className={idx > 0 ? "mt-1" : undefined}>
        <FormattedInline text={trimmed} />
      </div>
    );
  });
}

/** Renders structured markdown-like blocks (headings, code blocks, LaTeX math, lists, dividers, paragraphs) safely. */
function FormattedContent({
  content,
  onOpenMindmap,
}: {
  content: string;
  onOpenMindmap?: (mindmap: MindmapPayload) => void;
}) {
  const extractedMindmap = extractMindmapFromContent(content);
  if (extractedMindmap) {
    return (
      <div className="flex flex-col gap-3 text-body text-ink">
        {extractedMindmap.introText && <FormattedContent content={extractedMindmap.introText} />}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-tint text-primary">
              <Network size={20} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div>
              <p className="text-body font-semibold text-ink">{extractedMindmap.mindmap.title}</p>
              <p className="text-caption text-muted">
                {extractedMindmap.mindmap.nodes.length} konsep interaktif · Ditampilkan di panel Mindmap sebelah kanan
              </p>
            </div>
          </div>
          {onOpenMindmap && (
            <button
              type="button"
              onClick={() => onOpenMindmap(extractedMindmap.mindmap)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-caption font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              <Network size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>Buka Mindmap</span>
            </button>
          )}
        </div>
        {extractedMindmap.outroText && <FormattedContent content={extractedMindmap.outroText} />}
      </div>
    );
  }

  // Normalize multi-line $$ ... $$ blocks onto single $$ ... $$ lines outside fenced code blocks
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="flex flex-col gap-3 text-body text-ink">
      {segments.map((segment, segIdx) => {
        if (segment.startsWith("```") && segment.endsWith("```")) {
          const lines = segment.slice(3, -3).trim().split("\n");
          const firstLine = lines[0]?.trim() ?? "";
          const hasLang = /^[a-zA-Z0-9_+#-]+$/.test(firstLine);
          const code = hasLang ? lines.slice(1).join("\n") : lines.join("\n");
          return (
            <div key={segIdx} className="overflow-hidden rounded-md border border-border bg-surface">
              {hasLang && (
                <div className="border-b border-border bg-bg px-4 py-1.5 font-mono text-caption font-medium uppercase text-muted">
                  {firstLine}
                </div>
              )}
              <pre className="overflow-x-auto p-4 font-mono text-small text-ink">
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        const normalized = segment.replace(/\$\$\s*\n([\s\S]*?)\n\s*\$\$/g, (_, inner: string) => {
          return `$$${inner.replace(/\s*\n\s*/g, " ").trim()}$$`;
        });

        const rawLines = normalized.split("\n");
        const nodes: ReactNode[] = [];
        let paragraphBuffer: string[] = [];
        let listBuffer: ListEntry[] = [];

        const flushParagraph = (key: string) => {
          if (paragraphBuffer.length === 0) return;
          const text = paragraphBuffer.join("\n").trim();
          paragraphBuffer = [];
          if (!text) return;
          nodes.push(
            <p key={key} className="whitespace-pre-line leading-relaxed text-ink">
              <FormattedInline text={text} />
            </p>,
          );
        };

        const flushList = (key: string) => {
          if (listBuffer.length === 0) return;
          const items = listBuffer;
          listBuffer = [];
          const ordered = items[0]?.ordered ?? false;
          const ListTag = ordered ? "ol" : "ul";
          nodes.push(
            <ListTag
              key={key}
              className={`flex flex-col gap-2 pl-5 text-body text-ink ${ordered ? "list-decimal" : "list-disc"}`}
            >
              {items.map((item, itemIdx) => (
                <li
                  key={`${key}-item-${itemIdx}`}
                  className={`leading-relaxed ${item.indent >= 2 ? "ml-5 list-[circle]" : ""}`}
                >
                  {renderListItemLines(item.lines, `${key}-${itemIdx}`)}
                </li>
              ))}
            </ListTag>,
          );
        };

        rawLines.forEach((rawLine, lineIdx) => {
          const trimmed = rawLine.trim();

          if (!trimmed) {
            flushParagraph(`${segIdx}-p-${lineIdx}`);
            flushList(`${segIdx}-list-${lineIdx}`);
            return;
          }

          if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            flushParagraph(`${segIdx}-p-${lineIdx}`);
            flushList(`${segIdx}-list-${lineIdx}`);
            nodes.push(<hr key={`${segIdx}-hr-${lineIdx}`} className="border-border" />);
            return;
          }

          const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
          if (headingMatch) {
            flushParagraph(`${segIdx}-p-${lineIdx}`);
            flushList(`${segIdx}-list-${lineIdx}`);
            const cleanHeading = headingMatch[2].trim().replace(/^\*\*([\s\S]+)\*\*$/, "$1");
            nodes.push(
              <h3 key={`${segIdx}-h-${lineIdx}`} className="pt-1 text-h3 font-semibold text-ink">
                <FormattedInline text={cleanHeading} />
              </h3>,
            );
            return;
          }

          const listMatch = /^(\s*)([-*•]|\d+\.)\s+(.+)$/.exec(rawLine);
          if (listMatch) {
            flushParagraph(`${segIdx}-p-${lineIdx}`);
            const indent = listMatch[1].length;
            const ordered = /^\d+\.$/.test(listMatch[2]);
            listBuffer.push({
              ordered,
              indent,
              lines: [listMatch[3].trim()],
            });
            return;
          }

          if (
            (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) ||
            (trimmed.startsWith("\\[") && trimmed.endsWith("\\]") && trimmed.length > 4)
          ) {
            if (listBuffer.length > 0) {
              listBuffer[listBuffer.length - 1].lines.push(trimmed);
              return;
            }
            flushParagraph(`${segIdx}-p-${lineIdx}`);
            nodes.push(
              <div
                key={`${segIdx}-math-${lineIdx}`}
                className="overflow-x-auto rounded-md border border-border bg-bg px-3.5 py-2 font-mono text-small font-medium text-ink"
              >
                {formatLatexMath(trimmed.slice(2, -2))}
              </div>,
            );
            return;
          }

          if (listBuffer.length > 0 && /^\s{2,}\S/.test(rawLine)) {
            listBuffer[listBuffer.length - 1].lines.push(trimmed);
            return;
          }

          flushList(`${segIdx}-list-${lineIdx}`);
          paragraphBuffer.push(trimmed);
        });

        flushParagraph(`${segIdx}-p-end`);
        flushList(`${segIdx}-list-end`);

        return nodes;
      })}
    </div>
  );
}

const EXTRACTION_BADGES: Record<ExtractionState, { label: string; Icon: typeof CheckCircle2; tone: string }> = {
  EXTRACTED: { label: "Siap digunakan", Icon: CheckCircle2, tone: "text-success" },
  UPLOADED: { label: "Mengekstrak isi…", Icon: Clock, tone: "text-warning" },
  FAILED: { label: "Gagal dibaca", Icon: AlertCircle, tone: "text-danger" },
};

function SourceStatusBadge({ status }: { status: ExtractionState }) {
  const { label, Icon, tone } = EXTRACTION_BADGES[status];
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1 text-caption font-semibold ${tone}`}
    >
      <Icon
        size={16}
        strokeWidth={1.75}
        className={status === "EXTRACTED" ? "upload-check-pop" : undefined}
        aria-hidden="true"
      />
      {status !== "EXTRACTED" && <span>{label}</span>}
    </span>
  );
}

export function MaterialChatbot({
  initialMaterial,
  initialReplyPending = false,
}: {
  initialMaterial?: MaterialRow;
  initialReplyPending?: boolean;
}) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextIdRef = useRef(1);
  const uploadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const promptInputId = useId();
  const classSelectId = useId();
  const titleInputId = useId();

  const [chatId, setChatId] = useState<string | null>(
    initialMaterial?.id && isUuid(initialMaterial.id) ? initialMaterial.id : null,
  );
  const [title, setTitle] = useState(initialMaterial?.title ?? "Materi kelas baru");
  const [className, setClassName] = useState(initialMaterial?.className ?? TEACHER_CLASSES[0].name);
  const [sources, setSources] = useState<MaterialSource[]>(initialMaterial?.sources ?? []);
  const [messages, setMessages] = useState<ChatMessageItem[]>(initialMaterial?.messages ?? []);
  const [stagedFile, setStagedFile] = useState<MaterialSource | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(100);
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState(initialReplyPending);
  const [dragging, setDragging] = useState(false);
  const initialHasMindmap = useMemo(
    () => (initialMaterial?.messages ?? []).some((m) => m.role === "ASSISTANT" && extractMindmapFromContent(m.content) !== null),
    [initialMaterial?.messages],
  );

  const [rightPanel, setRightPanel] = useState<"closed" | "sources" | "mindmap">(
    initialHasMindmap ? "mindmap" : initialMaterial?.sources.length ? "sources" : "closed",
  );
  const [customMindmap, setCustomMindmap] = useState<MindmapPayload | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const prevMindmapMsgIdRef = useRef<string | null>(null);

  const latestMindmapEntry = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "ASSISTANT") {
        const extracted = extractMindmapFromContent(msg.content);
        if (extracted) return { id: msg.id, mindmap: extracted.mindmap };
      }
    }
    return null;
  }, [messages]);

  const activeMindmap = customMindmap ?? latestMindmapEntry?.mindmap ?? null;

  // Automatically switch right panel to Mindmap when a new mindmap message arrives
  useEffect(() => {
    if (!latestMindmapEntry) return;
    if (prevMindmapMsgIdRef.current !== latestMindmapEntry.id) {
      prevMindmapMsgIdRef.current = latestMindmapEntry.id;
      setCustomMindmap(null);
      setRightPanel("mindmap");
    }
  }, [latestMindmapEntry]);

  const isUploadingFile = stagedFile !== null && uploadProgress < 100;

  // Scroll the internal chat container to the bottom whenever a new message arrives.
  useEffect(() => {
    const container = scrollAreaRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  // Subscribe to Server-Sent Events (`/api/chats/:id/events`) pushed when the Python worker finishes `extract` or `chat_reply`.
  useEffect(() => {
    if (!chatId) return;

    const source = new EventSource(`/api/chats/${chatId}/events`);

    const handleStreamPayload = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as {
          materials?: MaterialView[];
          messages?: MessageView[];
          reply_pending?: boolean;
        };

        if (Array.isArray(data.materials)) {
          const nextMaterials = data.materials;
          setSources((prev) =>
            nextMaterials.map((item) => {
              const existing = prev.find((p) => p.id === item.id || p.title === item.title);
              return mapApiMaterial(item, existing?.sizeLabel ?? "Berkas");
            }),
          );
        }

        if (Array.isArray(data.messages)) {
          const nextMessages = data.messages;
          setMessages((prev) => {
            const attachmentById = new Map<string, MaterialSource>();
            for (const msg of prev) {
              if (msg.attachment) attachmentById.set(msg.id, msg.attachment);
            }
            return nextMessages.map((msg) => mapApiMessage(msg, attachmentById.get(msg.id)));
          });
        }

        if (typeof data.reply_pending === "boolean" && !data.reply_pending) {
          setThinking(false);
        }
      } catch {
        // Ignore malformed SSE payload
      }
    };

    source.addEventListener("snapshot", handleStreamPayload as EventListener);
    source.addEventListener("update", handleStreamPayload as EventListener);

    return () => {
      source.close();
    };
  }, [chatId]);

  useEffect(() => {
    return () => {
      if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
    };
  }, []);

  function adjustTextareaHeight() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }

  function validateAndCreateSource(file: File): MaterialSource | null {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const fileType = ALLOWED_EXTENSIONS[ext];
    if (!fileType) {
      toast.error("Format berkas belum didukung. Unggah berkas PDF, DOCX, atau PPTX.");
      return null;
    }
    if (file.size === 0) {
      toast.error("Berkas yang dipilih kosong.");
      return null;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Ukuran berkas melebihi batas maksimal 20 MB.");
      return null;
    }
    return {
      id: `src-${nextIdRef.current++}`,
      title: file.name,
      fileType,
      sizeLabel: formatFileSize(file.size),
      status: "UPLOADED",
    };
  }

  function attachFile(file: File) {
    const created = validateAndCreateSource(file);
    if (!created) return;

    if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
    setRawFile(file);
    setStagedFile(created);
    setUploadProgress(15);

    if (title === "Materi kelas baru") {
      const cleanName = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
      setTitle(cleanName);
    }

    let current = 15;
    uploadTimerRef.current = setInterval(() => {
      current += 28;
      if (current >= 100) {
        if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
        setUploadProgress(100);
        setStagedFile((prev) => (prev ? { ...prev, status: "EXTRACTED" } : null));
      } else {
        setUploadProgress(current);
      }
    }, 120);

    textareaRef.current?.focus();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) attachFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) attachFile(file);
  }

  async function submitMessage(customPrompt?: string) {
    if (thinking) return;
    const text = (customPrompt ?? prompt).trim();
    if (!text && !stagedFile) return;

    if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
    setUploadProgress(100);

    const attachedMeta = stagedFile ? { ...stagedFile, status: "UPLOADED" as const } : undefined;
    const fileToSend = rawFile;
    const finalText =
      text ||
      `Tolong pelajari berkas ${attachedMeta?.title} dan buatkan ringkasan materi serta soal latihan untuk kelas ${className}.`;

    const nextTitle = title === "Materi kelas baru" && text ? text.slice(0, 48) : title;
    if (nextTitle !== title) setTitle(nextTitle);

    const tempMessageId = `temp-user-${nextIdRef.current++}`;
    const optimisticMessage: ChatMessageItem = {
      id: tempMessageId,
      role: "USER",
      content: finalText,
      createdAt: formatTimeFromIso(),
      attachment: attachedMeta,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setPrompt("");
    setStagedFile(null);
    setRawFile(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setThinking(true);

    const formData = new FormData();
    if (chatId) formData.set("chat_id", chatId);
    formData.set("title", nextTitle);
    formData.set("text", finalText);
    if (fileToSend) formData.set("file", fileToSend, fileToSend.name);

    const result = await sendChatMessageAction(formData);
    if (!result.ok) {
      setThinking(false);
      toast.error(result.message);
      return;
    }

    if (!chatId) {
      setChatId(result.chat.id);
      window.history.replaceState(null, "", `/teacher/materials/${result.chat.id}`);
    }

    const savedAttachment = result.material
      ? mapApiMaterial(result.material, attachedMeta?.sizeLabel ?? "Berkas")
      : attachedMeta;

    if (savedAttachment) {
      setSources((prev) =>
        prev.some((s) => s.id === savedAttachment.id || s.title === savedAttachment.title)
          ? prev.map((s) => (s.title === savedAttachment.title ? savedAttachment : s))
          : [...prev, savedAttachment],
      );
    }

    setMessages((prev) =>
      prev.map((m) => (m.id === tempMessageId ? mapApiMessage(result.message, savedAttachment) : m)),
    );
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitMessage();
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  }

  async function copyMessage(id: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Teks tidak dapat disalin secara otomatis.");
    }
  }

  function removeSource(id: string) {
    setSources((prev) => prev.filter((item) => item.id !== id));
    toast.info("Berkas sumber dihapus dari tampilan.");
  }

  function resetNewChat() {
    if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
    setChatId(null);
    setTitle("Materi kelas baru");
    setSources([]);
    setMessages([]);
    setCustomMindmap(null);
    setRightPanel("closed");
    setStagedFile(null);
    setRawFile(null);
    setUploadProgress(100);
    setPrompt("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    window.history.replaceState(null, "", "/teacher/materials/new");
    textareaRef.current?.focus();
  }

  function handleGenerateMindmap() {
    const sourceNames = sources.map((s) => s.title).join(", ");
    const targetLabel = sourceNames || title;
    setRightPanel("mindmap");
    void submitMessage(
      `Tolong buatkan kerangka mindmap hierarkis (topik utama, sub-topik, dan poin kunci) yang mudah dipahami dari materi ${targetLabel}.`,
    );
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={handleDrop}
      /* Bleeds edge-to-edge inside DashboardShell's <main> (-mx-4 -my-6 sm:-mx-8) with a full-screen white surface */
      className="relative -mx-4 -my-6 flex h-[calc(100dvh-4rem)] flex-col overflow-hidden border-t border-border bg-surface sm:-mx-8 lg:border-l"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.pptx"
        onChange={handleFileChange}
        className="sr-only"
        aria-label="Unggah berkas materi PDF, DOCX, atau PPTX"
      />

      {dragging && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-primary bg-primary-tint/95 p-6 text-center"
        >
          <span className="upload-check-pop flex size-14 items-center justify-center rounded-full bg-surface text-primary">
            <FileUp size={28} strokeWidth={1.75} />
          </span>
          <p className="text-h1 font-semibold text-primary">Lepaskan berkas untuk mengunggah materi</p>
          <p className="text-body text-ink">Mendukung PDF, DOCX, atau PPTX hingga 20 MB</p>
        </div>
      )}

      {/* Full-width top bar on the white canvas */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5 sm:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <Link
            href="/teacher/materials"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-2 text-small font-semibold text-muted transition-colors duration-150 ease-out hover:bg-bg hover:text-ink"
          >
            <ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="hidden sm:inline">Materi</span>
          </Link>

          <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />

          <div className="min-w-0 flex-1">
            <label htmlFor={titleInputId} className="sr-only">
              Judul materi
            </label>
            <input
              id={titleInputId}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="focus-bare w-full truncate rounded-sm bg-transparent px-2 py-1 font-heading text-h3 font-semibold text-ink outline-none hover:bg-bg focus:bg-bg"
              placeholder="Judul materi kelas…"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRightPanel((p) => (p === "sources" ? "closed" : "sources"))}
            aria-expanded={rightPanel === "sources"}
            className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-small font-semibold transition-colors duration-150 ease-out ${
              rightPanel === "sources"
                ? "border-primary bg-primary-tint text-primary"
                : "border-border bg-surface text-ink hover:bg-bg"
            }`}
          >
            <FolderOpen size={20} strokeWidth={1.75} aria-hidden="true" />
            <span>Sumber ({sources.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setRightPanel((p) => (p === "mindmap" ? "closed" : "mindmap"))}
            aria-expanded={rightPanel === "mindmap"}
            className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-small font-semibold transition-colors duration-150 ease-out ${
              rightPanel === "mindmap"
                ? "border-primary bg-primary-tint text-primary"
                : "border-border bg-surface text-ink hover:bg-bg"
            }`}
          >
            <Network size={20} strokeWidth={1.75} aria-hidden="true" />
            <span>Mindmap</span>
          </button>

          <button
            type="button"
            onClick={resetNewChat}
            title="Mulai materi baru"
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-small font-semibold text-ink transition-colors duration-150 ease-out hover:bg-bg"
          >
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="hidden sm:inline">Baru</span>
          </button>
        </div>
      </header>

      {/* Main full-screen body: splits 50/50 when Mindmap visualization is open */}
      <div className="flex min-h-0 flex-1 overflow-hidden bg-surface">
        <section
          aria-label="Percakapan asisten AI"
          className={`flex min-w-0 flex-col overflow-hidden bg-surface transition-all duration-200 ${
            rightPanel === "mindmap" ? "w-full lg:w-1/2" : "flex-1"
          }`}
        >
          {/* Scrollable middle area with wider max-w-5xl reading & chat column */}
          <div ref={scrollAreaRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-8">
            {messages.length === 0 ? (
              <div className="mx-auto my-auto flex w-full max-w-5xl flex-col gap-5 py-2">
                <div className="flex flex-col gap-2">
                  <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-primary-tint px-3 py-1 text-caption font-semibold text-primary">
                    <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
                    Asisten AI Guru
                  </span>
                  <h1 className="text-display font-semibold text-ink">
                    Materi apa yang ingin Anda susun hari ini?
                  </h1>
                  <p className="text-body text-muted">
                    Unggah berkas PDF, DOCX, atau PPTX melalui tombol di bawah, atau pilih salah satu perintah cepat untuk mulai menyusun bahan ajar.
                  </p>
                </div>

                {/* Wide 2x2 starter prompt grid */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {STARTER_PROMPTS.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => void submitMessage(item.prompt)}
                      className="flex flex-col items-start gap-1 rounded-lg border border-border bg-bg p-4 text-left transition-colors duration-150 ease-out hover:border-primary hover:bg-primary-tint"
                    >
                      <span className="text-body font-semibold text-ink">{item.title}</span>
                      <span className="text-small text-muted">{item.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Wide conversation stream (max-w-5xl) */
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-2">
                {messages.map((message) =>
                  message.role === "USER" ? (
                    <article
                      key={message.id}
                      aria-label="Pesan Anda"
                      className="chat-item-in ml-auto flex max-w-[90%] flex-col items-end gap-2 sm:max-w-[78%]"
                    >
                      {message.attachment && (
                        <div className="inline-flex max-w-xs items-center gap-2 rounded-md border border-border bg-bg px-3 py-1.5">
                          <FileText size={16} strokeWidth={1.75} className="shrink-0 text-primary" aria-hidden="true" />
                          <span className="truncate text-small font-medium text-ink">{message.attachment.title}</span>
                        </div>
                      )}
                      <div className="rounded-lg bg-primary-tint px-4 py-3 text-body text-ink">
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                      <span className="text-caption text-muted">Anda · {message.createdAt}</span>
                    </article>
                  ) : (
                    <article
                      key={message.id}
                      aria-label="Balasan asisten AI"
                      className="chat-item-in flex w-full flex-col gap-4 rounded-lg border border-border bg-bg p-6"
                    >
                      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary"
                          >
                            <Sparkles size={18} strokeWidth={1.75} />
                          </span>
                          <div>
                            <p className="text-small font-semibold text-ink">Asisten NusaCode</p>
                            <p className="text-caption text-muted">Kelas {className} · {message.createdAt}</p>
                          </div>
                        </div>
                        {message.sources && message.sources.length > 0 && (
                          <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 py-1 text-caption font-medium text-muted">
                            <FileText size={16} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
                            {message.sources.every((s) => isUuid(s))
                              ? `Berdasarkan ${message.sources.length} bagian berkas materi`
                              : message.sources.join(", ")}
                          </span>
                        )}
                      </header>

                      <FormattedContent
                        content={message.content}
                        onOpenMindmap={(mm) => {
                          setCustomMindmap(mm);
                          setRightPanel("mindmap");
                        }}
                      />

                      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void copyMessage(message.id, message.content)}
                            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-small font-semibold text-ink transition-colors duration-150 ease-out hover:bg-primary-tint hover:text-primary"
                          >
                            {copiedId === message.id ? (
                              <Check size={20} strokeWidth={1.75} aria-hidden="true" />
                            ) : (
                              <Copy size={20} strokeWidth={1.75} aria-hidden="true" />
                            )}
                            {copiedId === message.id ? "Tersalin" : "Salin teks"}
                          </button>
                        </div>
                      </footer>
                    </article>
                  ),
                )}

                {thinking && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="chat-item-in inline-flex items-center gap-2 py-1"
                  >
                    <Sparkles size={16} strokeWidth={1.75} className="shrink-0 animate-pulse text-primary" aria-hidden="true" />
                    <span className="thinking-text text-small font-medium">
                      Thinking…
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Docked bottom prompt composer (wide max-w-5xl, pinned to bottom of white screen, no top hr) */}
          <div className="shrink-0 bg-surface px-4 pb-4 pt-2 sm:px-8">
            <form onSubmit={handleFormSubmit} className="mx-auto w-full max-w-5xl">
              <div className="rounded-lg border border-border bg-bg px-4 py-3 transition-colors duration-150 ease-out focus-within:border-primary">
                {/* Compact inline file pill inside the textbox showing only the file name */}
                {stagedFile && (
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <div className="chat-item-in inline-flex max-w-xs items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5">
                      {isUploadingFile ? (
                        <Spinner size={16} />
                      ) : (
                        <FileText size={16} strokeWidth={1.75} className="upload-check-pop shrink-0 text-primary" aria-hidden="true" />
                      )}
                      <span className="truncate text-small font-medium text-ink" title={stagedFile.title}>
                        {stagedFile.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
                          setStagedFile(null);
                          setRawFile(null);
                          setUploadProgress(100);
                        }}
                        aria-label={`Batal melampirkan ${stagedFile.title}`}
                        className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-150 ease-out hover:bg-bg hover:text-ink"
                      >
                        <X size={14} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}

                <label htmlFor={promptInputId} className="sr-only">
                  Pesan untuk asisten AI
                </label>
                <textarea
                  id={promptInputId}
                  ref={textareaRef}
                  rows={2}
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    adjustTextareaHeight();
                  }}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="Tanyakan sesuatu, atau minta AI membuat bahan ajar & soal dari berkas Anda… (Tekan Enter untuk kirim)"
                  className="focus-bare block max-h-36 min-h-[48px] w-full resize-none bg-transparent px-1 py-1 text-body text-ink outline-none placeholder:text-muted"
                />

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-small font-semibold text-ink transition-colors duration-150 ease-out hover:border-primary hover:bg-primary-tint hover:text-primary"
                    >
                      <Paperclip size={20} strokeWidth={1.75} aria-hidden="true" />
                      <span>Unggah materi</span>
                    </button>

                    <label htmlFor={classSelectId} className="sr-only">
                      Pilih kelas sasaran
                    </label>
                    <select
                      id={classSelectId}
                      value={className}
                      onChange={(event) => setClassName(event.target.value)}
                      className="min-h-11 rounded-md border border-border bg-surface px-3 text-small font-semibold text-ink transition-colors duration-150 ease-out hover:border-muted"
                    >
                      {TEACHER_CLASSES.map((item) => (
                        <option key={item.id} value={item.name}>
                          {item.name} · {item.subject}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button
                    type="submit"
                    loading={thinking || isUploadingFile}
                    disabled={thinking || isUploadingFile || (!prompt.trim() && !stagedFile)}
                  >
                    <Send size={20} strokeWidth={1.75} aria-hidden="true" />
                    {isUploadingFile ? "Mengunggah…" : "Kirim"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </section>

        {/* Right panel: toggles between Sumber Materi and 50/50 Interactive Mindmap Visualization */}
        {rightPanel !== "closed" && (
          <aside
            aria-label={rightPanel === "mindmap" ? "Visualisasi Mindmap Interaktif" : "Sumber materi yang diunggah"}
            className={`fixed inset-y-16 right-0 z-20 flex max-w-full shrink-0 flex-col overflow-hidden border-l border-border bg-surface shadow-[var(--shadow-overlay)] transition-all duration-200 lg:static lg:z-auto lg:shadow-none ${
              rightPanel === "mindmap" ? "w-full lg:w-1/2" : "w-80"
            }`}
          >
            {/* Shared toggle header so Sumber Materi and Mindmap can be switched anytime */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2.5">
              <div className="inline-flex rounded-md border border-border bg-bg p-0.5">
                <button
                  type="button"
                  onClick={() => setRightPanel("sources")}
                  className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-caption font-semibold transition-colors ${
                    rightPanel === "sources"
                      ? "bg-surface text-primary shadow-xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <FolderOpen size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>Sumber ({sources.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRightPanel("mindmap")}
                  className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-caption font-semibold transition-colors ${
                    rightPanel === "mindmap"
                      ? "bg-surface text-primary shadow-xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <Network size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>Mindmap</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setRightPanel("closed")}
                aria-label="Tutup panel kanan"
                className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink"
              >
                <X size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            {rightPanel === "sources" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
                <div>
                  <h2 className="text-h3 font-semibold text-ink">Sumber materi</h2>
                  <p className="text-caption text-muted">Berkas referensi pada percakapan ini.</p>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-caption font-semibold text-ink transition-colors duration-150 ease-out hover:border-primary hover:bg-primary-tint hover:text-primary"
                >
                  <FileUp size={15} strokeWidth={1.75} aria-hidden="true" />
                  <span>Tambah berkas (PDF/DOCX/PPTX)</span>
                </button>

                {sources.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border bg-bg p-5 text-center">
                    <p className="text-small font-semibold text-ink">Belum ada berkas</p>
                    <p className="mt-1 text-caption text-muted">
                      Unggah modul PDF, DOCX, atau slide PPTX agar AI menyusun materi sesuai bahan ajar Anda.
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {sources.map((source) => (
                      <li key={source.id} className="chat-item-in flex flex-col gap-2 rounded-md border border-border bg-bg p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <span
                              aria-hidden="true"
                              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary-tint text-primary"
                            >
                              <FileText size={18} strokeWidth={1.75} />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-small font-semibold text-ink" title={source.title}>
                                {source.title}
                              </p>
                              <p className="text-caption text-muted">
                                {source.fileType} · {source.sizeLabel}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSource(source.id)}
                            aria-label={`Hapus berkas ${source.title}`}
                            className="-m-1 flex size-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-surface hover:text-danger"
                          >
                            <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between border-t border-border pt-2">
                          <SourceStatusBadge status={source.status} />
                          <button
                            type="button"
                            onClick={() =>
                              void submitMessage(`Tolong buatkan ringkasan materi dan latihan soal dari berkas ${source.title}.`)
                            }
                            className="text-caption font-semibold text-primary hover:underline"
                          >
                            Gunakan di chat
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <hr className="mt-auto border-border" />

                <Button
                  variant="primary"
                  full
                  onClick={handleGenerateMindmap}
                  disabled={thinking || isUploadingFile}
                >
                  <Network size={18} strokeWidth={1.75} aria-hidden="true" />
                  Buat Mindmap
                </Button>
              </div>
            ) : activeMindmap ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <MindmapBoard
                  mindmap={activeMindmap}
                  fillHeight
                  onAskNodePrompt={(promptText) => void submitMessage(promptText)}
                />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-primary-tint text-primary">
                  <Network size={24} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div className="max-w-xs">
                  <p className="text-h3 font-semibold text-ink">
                    {thinking ? "Sedang menyusun Mindmap…" : "Belum ada Mindmap"}
                  </p>
                  <p className="mt-1 text-caption text-muted">
                    {thinking
                      ? "Harap tunggu sebentar, AI sedang memetakan konsep utama dan cabang materi Anda."
                      : "Buat visualisasi peta konsep interaktif dari berkas materi pada percakapan ini."}
                  </p>
                </div>
                <Button
                  variant="primary"
                  onClick={handleGenerateMindmap}
                  loading={thinking}
                  disabled={thinking || isUploadingFile}
                >
                  <Network size={18} strokeWidth={1.75} aria-hidden="true" />
                  Buat Mindmap Sekarang
                </Button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

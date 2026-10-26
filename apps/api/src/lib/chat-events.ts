import pg from "pg";

type Listener = () => void;

const listenersByChat = new Map<string, Set<Listener>>();
let pgClient: pg.Client | null = null;
let connecting = false;

function ensurePgListener(): void {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || pgClient || connecting) return;

  connecting = true;
  const client = new pg.Client({ connectionString: dbUrl });

  client.on("notification", (msg) => {
    if (msg.channel === "chat_events" && msg.payload) {
      notifyChatListeners(msg.payload.trim());
    }
  });

  client.on("error", () => {
    pgClient = null;
    connecting = false;
  });

  client.on("end", () => {
    pgClient = null;
    connecting = false;
  });

  client
    .connect()
    .then(() => client.query("LISTEN chat_events"))
    .then(() => {
      pgClient = client;
      connecting = false;
    })
    .catch(() => {
      pgClient = null;
      connecting = false;
    });
}

export function notifyChatListeners(chatId: string): void {
  const set = listenersByChat.get(chatId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn();
    } catch {
      // ignore subscriber error
    }
  }
}

export function subscribeChatEvents(chatId: string, onUpdate: Listener): () => void {
  ensurePgListener();
  let set = listenersByChat.get(chatId);
  if (!set) {
    set = new Set();
    listenersByChat.set(chatId, set);
  }
  set.add(onUpdate);

  return () => {
    const current = listenersByChat.get(chatId);
    if (!current) return;
    current.delete(onUpdate);
    if (current.size === 0) {
      listenersByChat.delete(chatId);
    }
  };
}

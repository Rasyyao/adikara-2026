/** A point on the board, in the board's own (scene) coordinates, so it lands on the same spot at any zoom. */
export interface CursorPoint {
  x: number;
  y: number;
}

/** One message of a live board from a teacher or a student. Every part is optional. */
export interface LiveInput {
  /** New or changed elements, whole. */
  upserts?: Record<string, unknown>[];
  /** Ids of removed elements. */
  deletes?: string[];
  /** Where the sender's pointer is on the board; null when it left the board. */
  cursor?: CursorPoint | null;
  /** Teacher only: whether students may draw. */
  drawAllowed?: boolean;
}

/** What the sender must undo locally: changes the server refused (a student touching what is not theirs). */
export interface LiveResult {
  revert: { upserts: Record<string, unknown>[]; deletes: string[] };
}

/** Who is on the board, as the others see them. */
export interface LiveActor {
  id: string;
  name: string;
  role: "teacher" | "student";
}

/** The board as a new stream starts from it. */
export interface LiveSnapshot {
  board: { elements: Record<string, unknown>[] };
  draw_allowed: boolean;
  me: LiveActor;
}

/** Where the live board reads and keeps the drawing. */
export interface LiveBoardStore {
  findBoard(sessionId: string): Promise<{ scene: { elements: Record<string, unknown>[]; appState: { viewBackgroundColor?: string } } } | null>;
  saveBoard(sessionId: string, scene: { elements: Record<string, unknown>[]; appState: { viewBackgroundColor?: string } }): Promise<unknown>;
  findTeacherName(teacherId: string): Promise<string | null>;
}

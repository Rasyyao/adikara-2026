import { describe, expect, it } from "vitest";
import { boundsOf, cloneElements, hitElement, sanitizeElements, transformElements } from "@/components/session/board/geometry";
import { quizPath } from "@/components/session/board/quiz-card";
import type { QuizElement } from "@/components/session/board/types";

const saved = { type: "quiz", id: "q1", x: 10, y: 20, width: 360, height: 460, quizId: "quiz-1", sessionId: "s-1", title: "Pre-Test", kind: "pretest", questionCount: 10, strokeColor: "#000", backgroundColor: "transparent", strokeWidth: 2, version: 1 };

describe("a quiz card on the board", () => {
  it("survives a save and reload, closed or not", () => {
    const [card] = sanitizeElements([saved, { ...saved, id: "q2", closed: true }]) as QuizElement[];
    expect(card).toMatchObject({ type: "quiz", quizId: "quiz-1", sessionId: "s-1", title: "Pre-Test", questionCount: 10 });
    expect(card.closed).toBeUndefined();
    expect((sanitizeElements([{ ...saved, closed: true }])[0] as QuizElement).closed).toBe(true);
  });
  it("is dropped when it does not say which quiz it is", () => {
    expect(sanitizeElements([{ ...saved, quizId: undefined }])).toEqual([]);
  });
  it("is hit anywhere inside, so a click on its middle opens the quiz", () => {
    const [card] = sanitizeElements([saved]);
    expect(hitElement(card, [190, 250], 2)).toBe(true);
    expect(hitElement(card, [500, 250], 2)).toBe(false);
  });
  it("keeps its proportions when stretched, so its QR code stays square", () => {
    const [card] = sanitizeElements([saved]);
    const [stretched] = transformElements([card], boundsOf(card), { x: 0, y: 0, w: 720, h: 460 }) as QuizElement[];
    expect(stretched.width / stretched.height).toBeCloseTo(360 / 460);
  });
  it("a copy keeps pointing at the same quiz", () => {
    const [card] = sanitizeElements([saved]);
    const [copy] = cloneElements([card], 10, 10) as QuizElement[];
    expect(copy.id).not.toBe(card.id);
    expect(copy.quizId).toBe("quiz-1");
  });
  it("its QR code leads to the student's quiz page", () => {
    expect(quizPath("s-1", "quiz-1")).toBe("/student/sessions/s-1/quiz/quiz-1");
  });
});

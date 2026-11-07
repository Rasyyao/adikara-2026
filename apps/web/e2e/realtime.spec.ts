import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS } from "./env";
import { QUIZ, joinWithPin, person, teacherApi } from "./helpers";

// How long it takes, in real browsers through the web server's proxy, for what one person does to appear on another's
// screen: the target is one second. Each check runs inside the page that should change and reports the moment the
// change is in the DOM, so the test runner's own polling does not inflate the numbers. Students act at the same time.

const TARGET_MS = 1000;
const BOARD = '[role="application"][aria-label="Kanvas papan tulis"]';

type Condition = { text: string } | { selector: string; min: number };

/** Starts watching `page`; resolves with the page's clock (ms) when the condition first holds. Arm before acting. */
function seen(page: Page, condition: Condition): Promise<number> {
  return page
    .waitForFunction(
      (c) => {
        const ok = "text" in c ? document.body.innerText.toLowerCase().includes(c.text.toLowerCase()) : document.querySelectorAll(c.selector).length >= c.min;
        return ok ? Date.now() : 0;
      },
      condition,
      { polling: 10, timeout: 15_000 },
    )
    .then((handle) => handle.jsonValue() as Promise<number>);
}

const count = (page: Page, selector: string) => page.evaluate((s) => document.querySelectorAll(s).length, selector);

test.describe.configure({ mode: "serial" });

test("what the teacher and students do reaches the others' screens within a second", async ({ browser, request }) => {
  const timings: { step: string; ms: number }[] = [];
  const time = async (step: string, watchers: Promise<number>[], act: () => Promise<unknown>) => {
    const started = Date.now();
    await act();
    for (const at of await Promise.all(watchers)) timings.push({ step, ms: at - started });
  };

  const api = await teacherApi(request);
  await api.endLiveSessions();
  const { session } = await api.post<{ session: { id: string; join_code: string } }>("/sessions", { class_code: ACCOUNTS.classCode });

  const teacher = await person(browser, { email: ACCOUNTS.teacher.email });
  const students = await Promise.all(ACCOUNTS.students.map((s) => person(browser, { username: s.username })));

  await teacher.page.goto(`/teacher/sessions/${session.id}`);
  await expect(teacher.page.getByText(session.join_code)).toBeVisible();

  // both students type the PIN at the same moment; the teacher sees each name
  await time(
    "student joins → teacher sees the name",
    ACCOUNTS.students.map((s) => seen(teacher.page, { text: s.name })),
    () => Promise.all(students.map((s) => joinWithPin(s.page, session.id, session.join_code))),
  );
  for (const s of students) await expect(s.page.getByRole("heading", { name: "Anda sudah masuk" })).toBeVisible();

  await time(
    "teacher starts → student gets the board",
    students.map((s) => seen(s.page, { text: "Papan kelas" })),
    () => teacher.page.getByRole("button", { name: "Mulai sesi" }).click(),
  );

  await teacher.page.getByRole("tab", { name: "Papan tulis" }).click();
  await expect(teacher.page.getByText("Live")).toBeVisible();
  for (const s of students) await expect(s.page.locator(BOARD)).toBeVisible();

  // the teacher's cursor, with the teacher's name, appears on the students' boards (the first time it enters the board)
  const teacherCanvas = teacher.page.locator(BOARD);
  const box = (await teacherCanvas.boundingBox())!;
  await time(
    "teacher moves cursor → student sees it",
    students.map((s) => seen(s.page, { text: ACCOUNTS.teacher.name })),
    () => teacher.page.mouse.move(box.x + 520, box.y + 340, { steps: 3 }),
  );

  // the teacher draws a rectangle: it appears on both students' boards (shapes stream while being drawn, so this times
  // the whole stroke, from pressing the mouse, until it is on the other screens)
  await teacher.page.keyboard.press("r");
  await teacher.page.mouse.move(box.x + 200, box.y + 150);
  const rectsBefore = await Promise.all(students.map((s) => count(s.page, `${BOARD} g rect`)));
  await time(
    "teacher draws → student sees the shape",
    students.map((s, i) => seen(s.page, { selector: `${BOARD} g rect`, min: rectsBefore[i] + 1 })),
    async () => {
      await teacher.page.mouse.down();
      await teacher.page.mouse.move(box.x + 420, box.y + 300, { steps: 8 });
      await teacher.page.mouse.up();
    },
  );

  // both students draw an ellipse at the same moment: the teacher gets both
  const ellipsesBefore = await count(teacher.page, `${BOARD} ellipse`);
  const starts: { x: number; y: number }[] = [];
  for (const [i, s] of students.entries()) {
    const canvas = s.page.locator(BOARD);
    const b = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: 20, y: 20 } }); // focus the board for its shortcuts
    await s.page.keyboard.press("o");
    await s.page.mouse.move(b.x + 480 + i * 160, b.y + 200);
    starts.push(b);
  }
  await time("students draw at once → teacher sees both", [seen(teacher.page, { selector: `${BOARD} ellipse`, min: ellipsesBefore + 2 })], () =>
    Promise.all(
      students.map(async (s, i) => {
        await s.page.mouse.down();
        await s.page.mouse.move(starts[i].x + 600 + i * 160, starts[i].y + 300, { steps: 6 });
        await s.page.mouse.up();
      }),
    ),
  );
  // and each student sees the other's
  for (const s of students) await expect.poll(() => count(s.page, `${BOARD} ellipse`)).toBe(ellipsesBefore + 2);

  // the teacher locks drawing
  await time(
    "teacher locks the board → student is told",
    students.map((s) => seen(s.page, { text: "Guru sedang mengunci papan" })),
    () => teacher.page.getByRole("button", { name: "Siswa boleh menggambar" }).click(),
  );

  // a quiz is opened (from the API, as the AI-made quiz would be): both students are told
  let quizId = "";
  await time(
    "quiz opened → student is told",
    students.map((s) => seen(s.page, { text: "Kuis baru dari guru" })),
    async () => (quizId = (await api.post<{ quiz: { id: string } }>(`/sessions/${session.id}/quizzes`, QUIZ)).quiz.id),
  );
  expect(quizId).not.toBe("");

  // both students take it and hand it in at the same moment: the teacher's quiz list follows (a quiz opened from the
  // API is listed under "Kontrol sesi"; the board shows a counter only for a quiz card placed on the board)
  await teacher.page.getByRole("tab", { name: "Kontrol sesi" }).click();
  await expect(teacher.page.getByRole("region", { name: "Kuis sesi ini" }).getByText(QUIZ.title)).toBeVisible();
  const dialogs = await Promise.all(
    students.map(async (s) => {
      await s.page.getByRole("button", { name: "Kerjakan" }).click();
      const dialog = s.page.getByRole("dialog", { name: "Kuis" });
      await dialog.getByRole("button", { name: "Mulai kerjakan" }).click();
      await dialog.getByRole("radio", { name: /^B\s*7$/ }).click();
      await dialog.getByRole("button", { name: "Berikutnya" }).click();
      await dialog.getByRole("radio", { name: /^B\s*float$/ }).click();
      await dialog.getByRole("button", { name: "Kumpulkan" }).click();
      return dialog;
    }),
  );
  await time(
    "students hand in at once → teacher's counter shows both",
    [seen(teacher.page, { text: "2/2 selesai" })],
    () => Promise.all(dialogs.map((d) => d.getByRole("button", { name: "Kumpulkan" }).click())),
  );
  // each sees their score and a rank (taken when they handed in: two students handing in at the same instant each see
  // "1 dari 1", since neither had seen the other's yet)
  for (const d of dialogs) await expect(d.getByText(/Peringkat \d+ dari \d+/)).toBeVisible();

  // the teacher ends the class: both students get the "session finished" screen
  await time(
    "teacher ends → student is told",
    students.map((s) => seen(s.page, { text: "Sesi sudah selesai" })),
    () => api.post(`/sessions/${session.id}/end`),
  );

  console.table(timings);
  const slow = timings.filter((t) => t.ms > TARGET_MS);
  expect(slow, `slower than ${TARGET_MS}ms`).toEqual([]);

  await teacher.close();
  await Promise.all(students.map((s) => s.close()));
});

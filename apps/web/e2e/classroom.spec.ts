import { expect, test } from "@playwright/test";
import { ACCOUNTS } from "./env";
import { QUIZ, joinWithPin, person, teacherApi } from "./helpers";

// A whole class period, as the people in it see it: the teacher opens a session, a student joins with the PIN, they
// share the whiteboard (strokes and the teacher's named cursor), the teacher locks drawing, opens a quiz, the student
// takes it, and the teacher reads the ranking and the per-question results. The answers recorded by the browser are
// checked in the export, the data meant for analysing where the class goes wrong.

test.describe.configure({ mode: "serial" });

test("a class shares the board and takes a quiz", async ({ browser, request }) => {
  const api = await teacherApi(request);
  await api.endLiveSessions();
  const { session } = await api.post<{ session: { id: string; join_code: string } }>("/sessions", { class_code: ACCOUNTS.classCode });

  const teacher = await person(browser, { email: ACCOUNTS.teacher.email });
  const student = await person(browser, { username: ACCOUNTS.students[0].username });

  await test.step("the student joins with the PIN and waits", async () => {
    await teacher.page.goto(`/teacher/sessions/${session.id}`);
    await expect(teacher.page.getByText(session.join_code)).toBeVisible();

    await joinWithPin(student.page, session.id, session.join_code);
    await expect(student.page.getByRole("heading", { name: "Anda sudah masuk" })).toBeVisible();
    await expect(teacher.page.getByText(ACCOUNTS.students[0].name, { exact: true })).toBeVisible(); // the teacher sees who joined
  });

  await test.step("the teacher starts the class and the student gets the board", async () => {
    await teacher.page.getByRole("button", { name: "Mulai sesi" }).click();
    await expect(student.page.getByRole("heading", { name: "Papan kelas" })).toBeVisible();
    await expect(student.page.getByText("Papan masih kosong")).toBeVisible();
  });

  const teacherCanvas = teacher.page.getByRole("application", { name: "Kanvas papan tulis" });
  const studentBoard = student.page.getByRole("region", { name: "Papan tulis kelas" });

  await test.step("a shape the teacher draws appears on the student's board", async () => {
    await teacher.page.getByRole("tab", { name: "Papan tulis" }).click();
    await expect(teacher.page.getByText("Live")).toBeVisible();
    const box = (await teacherCanvas.boundingBox())!;
    await teacher.page.keyboard.press("r"); // rectangle tool
    await teacher.page.mouse.move(box.x + 200, box.y + 150);
    await teacher.page.mouse.down();
    await teacher.page.mouse.move(box.x + 420, box.y + 300, { steps: 8 });
    await teacher.page.mouse.up();
    await expect(student.page.getByText("Papan masih kosong")).toBeHidden();
  });

  await test.step("the student sees the teacher's cursor with the teacher's name", async () => {
    const box = (await teacherCanvas.boundingBox())!;
    await teacher.page.mouse.move(box.x + 500, box.y + 320, { steps: 5 });
    await teacher.page.mouse.move(box.x + 520, box.y + 340, { steps: 5 });
    await expect(studentBoard.getByText(ACCOUNTS.teacher.name)).toBeVisible();
    await expect(studentBoard.getByText("Guru", { exact: true })).toBeVisible();
  });

  await test.step("a student's stroke reaches the teacher, until the teacher locks the board", async () => {
    await expect(teacherCanvas.locator("ellipse")).toHaveCount(0); // the teacher drew a rectangle only
    const canvas = student.page.getByRole("application", { name: "Kanvas papan tulis" });
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: 20, y: 20 } }); // focus the board for its keyboard shortcuts
    await student.page.keyboard.press("o"); // ellipse
    await student.page.mouse.move(box.x + 500, box.y + 200);
    await student.page.mouse.down();
    await student.page.mouse.move(box.x + 640, box.y + 300, { steps: 8 });
    await student.page.mouse.up();
    await expect(teacherCanvas.locator("ellipse").first()).toBeVisible(); // the student's ellipse, on the teacher's board

    await teacher.page.getByRole("button", { name: "Siswa boleh menggambar" }).click();
    await expect(teacher.page.getByRole("button", { name: "Papan dikunci" })).toBeVisible();
    await expect(student.page.getByText("Guru sedang mengunci papan")).toBeVisible();
  });

  const { quiz } = await api.post<{ quiz: { id: string } }>(`/sessions/${session.id}/quizzes`, QUIZ);

  await test.step("the student is told about the quiz, takes it, changes one answer and hands it in", async () => {
    await expect(student.page.getByText("Kuis baru dari guru")).toBeVisible();
    await student.page.getByRole("button", { name: "Kerjakan" }).click();
    const dialog = student.page.getByRole("dialog", { name: "Kuis" });
    await expect(dialog.getByRole("heading", { name: QUIZ.title })).toBeVisible();
    await dialog.getByRole("button", { name: "Mulai kerjakan" }).click();

    await dialog.getByRole("radio", { name: /^A\s*5$/ }).click(); // wrong first …
    await student.page.waitForTimeout(400);
    await dialog.getByRole("radio", { name: /^B\s*7$/ }).click(); // … then right
    await expect(dialog.getByRole("radio", { name: /^B\s*7$/ })).toHaveAttribute("aria-checked", "true");
    await dialog.getByRole("button", { name: "Berikutnya" }).click();
    await dialog.getByRole("radio", { name: /^B\s*float$/ }).click();
    await dialog.getByRole("button", { name: "Kumpulkan" }).click();
    await dialog.getByRole("button", { name: "Kumpulkan" }).click(); // confirm

    await expect(dialog.getByText("Peringkat 1 dari 1")).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Pembahasan" })).toBeVisible();
    await expect(dialog.getByText("Nilai baru menimpa nilai lama.")).toBeVisible();
  });

  await test.step("the teacher reads the ranking and how each question went", async () => {
    await teacher.page.getByRole("tab", { name: "Kontrol sesi" }).click();
    const list = teacher.page.getByRole("region", { name: "Kuis sesi ini" });
    await expect(list.getByText(QUIZ.title)).toBeVisible();
    await expect(list.getByText(/1 selesai/)).toBeVisible();
    await list.getByRole("button", { name: "Lihat hasil" }).click();

    const panel = teacher.page.getByRole("dialog", { name: "Hasil kuis" });
    await expect(panel.getByText(ACCOUNTS.students[0].name)).toBeVisible();
    await expect(panel.getByText("🥇")).toBeVisible();
    await expect(panel.getByText("2/2", { exact: true }).first()).toBeVisible();
    await panel.getByRole("tab", { name: "Per soal" }).click();
    await expect(panel.getByText(/1 ganti jawaban \(1 jadi benar, 0 jadi salah\)/)).toBeVisible();
  });

  await test.step("the export holds what the browser recorded: first pick, every change, time, device", async () => {
    const data = await api.get<{ rows: Record<string, unknown>[] }>(`/sessions/${session.id}/quizzes/${quiz.id}/export`);
    const first = data.rows.find((r) => r.question_id === 1)!;
    expect(first).toMatchObject({ student_name: ACCOUNTS.students[0].name, choice: "B", first_choice: "A", changed: true, is_correct: true, entry: "board", answer_order: 1 });
    expect((first.changes as { choice: string }[]).map((c) => c.choice)).toEqual(["A", "B"]);
    expect(first.time_ms as number).toBeGreaterThan(0);
    expect((first.client as { user_agent: string }).user_agent).toContain("Chrome");
  });

  await test.step("a second student opens the quiz from its QR link on another device", async () => {
    const other = await person(browser, { username: ACCOUNTS.students[1].username });
    await joinWithPin(other.page, session.id, session.join_code);

    await other.page.goto(`/student/sessions/${session.id}/quiz/${quiz.id}?from=qr`);
    await other.page.getByRole("button", { name: "Mulai kerjakan" }).click();
    await other.page.getByRole("radio", { name: /^C\s*12$/ }).click();
    await other.page.getByRole("button", { name: "Berikutnya" }).click();
    await other.page.getByRole("button", { name: "Kumpulkan" }).click();
    await other.page.getByRole("button", { name: "Kumpulkan" }).click();
    await expect(other.page.getByText("Peringkat 2 dari 2")).toBeVisible();
    await expect(other.page.getByText("Tidak dijawab")).toBeVisible(); // question 2 was left empty

    const data = await api.get<{ rows: Record<string, unknown>[] }>(`/sessions/${session.id}/quizzes/${quiz.id}/export`);
    expect(data.rows.find((r) => r.student_name === ACCOUNTS.students[1].name && r.question_id === 1)).toMatchObject({ choice: "C", entry: "qr", is_correct: false });
    await other.close();
  });

  await test.step("the teacher closes the quiz; a late student can no longer start it", async () => {
    const panel = teacher.page.getByRole("dialog", { name: "Hasil kuis" });
    await panel.getByRole("button", { name: "Tutup kuis" }).click();
    await expect(panel.getByText("Ditutup", { exact: true })).toBeVisible();
    const results = await api.get<{ summary: { submitted: number; highest: number; lowest: number } }>(`/sessions/${session.id}/quizzes/${quiz.id}/results`);
    expect(results.summary).toMatchObject({ submitted: 2, highest: 2, lowest: 0 });
  });

  await api.post(`/sessions/${session.id}/end`);
  await teacher.close();
  await student.close();
});

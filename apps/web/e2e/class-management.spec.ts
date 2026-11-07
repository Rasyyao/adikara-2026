import { expect, test } from "@playwright/test";
import { ACCOUNTS } from "./env";
import { joinWithPin, person, teacherApi } from "./helpers";

// A teacher makes a class and adds a student in the dashboard. Only that class's students can enter its room.

test("a teacher adds a class and a student; only that student can join the class's session", async ({ browser, request }) => {
  const api = await teacherApi(request);
  await api.endLiveSessions();
  const stamp = Date.now().toString(36);
  const className = `Kelas Uji ${stamp}`;
  const code = `UJI${stamp}`.toUpperCase();
  const username = `uji.${stamp}`;

  const teacher = await person(browser, { email: ACCOUNTS.teacher.email });
  const page = teacher.page;

  // add the class
  await page.goto("/teacher/classes");
  await page.getByRole("button", { name: "Tambah kelas" }).click();
  const classDialog = page.getByRole("dialog", { name: "Tambah kelas" });
  await classDialog.getByLabel("Nama kelas").fill(className);
  await classDialog.getByLabel("Kode kelas (opsional)").fill(code);
  await classDialog.getByRole("button", { name: "Simpan kelas" }).click();
  await expect(page.getByRole("row", { name: new RegExp(className) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(className) }).getByText(`Kode kelas: ${code}`).first()).toBeVisible();

  // add a student to it: the username is suggested from the name
  await page.getByRole("link", { name: "Siswa", exact: true }).click();
  await expect(page).toHaveURL(/\/teacher\/students/);
  await page.getByRole("button", { name: "Tambah siswa" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Tambah siswa" });
  await dialog.getByLabel("Nama siswa").fill("Siswa Uji");
  await dialog.getByLabel("Nama pengguna").fill(username);
  await dialog.getByLabel("Kata sandi", { exact: true }).fill(ACCOUNTS.password);
  await dialog.getByLabel("Kelas").selectOption({ label: `${className} (${code})` });
  await dialog.getByRole("button", { name: "Simpan siswa" }).click();
  // the test database keeps earlier runs' students, so match this run's own row (name + class)
  await expect(page.getByRole("row", { name: new RegExp(`Siswa Uji ${className}`) })).toBeVisible();

  // start the class's session; the new student gets in, a student of another class does not
  const { session } = await api.post<{ session: { id: string; join_code: string } }>("/sessions", { class_code: code });
  const member = await person(browser, { username });
  const outsider = await person(browser, { username: ACCOUNTS.students[0].username });

  await joinWithPin(member.page, session.id, session.join_code);
  await expect(member.page.getByRole("heading", { name: "Anda sudah masuk" })).toBeVisible();

  await outsider.page.getByRole("button", { name: "Masuk sesi" }).first().click();
  await outsider.page.getByRole("group", { name: "PIN sesi, 6 angka" }).getByRole("textbox").first().click();
  await outsider.page.keyboard.type(session.join_code, { delay: 30 });
  await expect(outsider.page).not.toHaveURL(/\/student\/sessions\//);
  await expect(outsider.page.getByText(/bukan anggota kelas/i).first()).toBeVisible();

  await Promise.all([teacher.close(), member.close(), outsider.close()]);
  await api.endLiveSessions();
});

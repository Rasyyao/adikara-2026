import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS } from "./env";
import { joinWithPin, person, teacherApi } from "./helpers";

// Problem solving from the beginning, as the people in the class see it. The teacher writes a problem (blocks and a
// JavaScript task), tries it as a student and marks it ready. In a live session the teacher sends it; it pops up on
// both students' screens at once. They solve it at the same time, one by arranging blocks, the other by writing
// JavaScript, while the teacher watches who solved it, how, and after how many tries. Then the teacher closes it.

test.describe.configure({ mode: "serial" });

const SHOTS = process.env.E2E_SHOTS; // a folder to keep screenshots of each step in, for reading the flow afterwards
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const STORY = "Pak Budi membuat jembatan dari 5 papan kayu. Setiap papan dipaku dengan 4 paku. Papan berwarna cokelat dan dibeli di pasar.";
const REFERENCE = "function jumlahPaku(papan, pakuPerPapan) {\n  let paku = 0;\n  for (let i = 0; i < papan; i++) {\n    paku += pakuPerPapan;\n  }\n  return paku;\n}\n";

/** Clicks blocks from the tray in order, then nests `inner` into the block above it. */
async function arrange(page: Page, scope: ReturnType<Page["getByRole"]>, blocks: string[], inner?: string) {
  for (const name of blocks) await scope.getByRole("button", { name: `${name}. Tambahkan ke susunan` }).click();
  if (inner) {
    await scope.getByRole("region", { name: /Area susun|Kunci jawaban/ }).getByRole("button", { name: new RegExp(`^${inner}`) }).click();
    await scope.getByRole("button", { name: "Masukkan ke blok di atasnya" }).click();
  }
}

test("a teacher writes a problem, sends it to the class, and two students solve it at once, with blocks and with JavaScript", async ({ browser, request }) => {
  test.setTimeout(300_000);
  const title = `Jembatan kayu ${Date.now().toString(36)}`;
  const teacher = await person(browser, { email: ACCOUNTS.teacher.email });
  const page = teacher.page;

  await test.step("the teacher starts a problem and writes the story and the task", async () => {
    await page.goto("/teacher/problems");
    await page.getByRole("button", { name: "Buat manual" }).first().click();
    await page.getByLabel("Judul soal").fill(title);
    await page.getByRole("button", { name: "Buat draf kosong" }).click();
    await expect(page).toHaveURL(/\/teacher\/problems\/[0-9a-f-]{36}$/);
    await page.getByLabel("Cerita masalah").fill(STORY);
    await page.getByLabel("Tugas untuk siswa").fill("Susun program untuk memaku semua papan jembatan.");
    await page.getByLabel(/Petunjuk/).fill("Pekerjaan untuk satu papan diulang sebanyak jumlah papan.");
  });

  await test.step("…arranges the answer key from blocks, with one distractor", async () => {
    const add = async (kind: string, text: string, distractor = false) => {
      await page.getByRole("radio", { name: kind, exact: true }).check({ force: true });
      await page.getByLabel("Teks blok").fill(text);
      if (distractor) await page.getByRole("button", { name: "Jadi pengecoh" }).click();
      else await page.getByLabel("Teks blok").press("Enter");
    };
    await add("Mulai", "ketika mulai");
    await add("Ulangi", "ulangi 5 kali");
    await add("Langkah", "pasang 4 paku");
    await add("Langkah", "cat papan merah", true);
    const key = page.getByRole("region", { name: "Kunci jawaban" });
    await key.getByRole("button", { name: /^Langkah: pasang 4 paku/ }).click();
    await page.getByRole("button", { name: "Masukkan ke blok di atasnya" }).click();
    await expect(key.getByRole("button", { name: /^Ulangi: ulangi 5 kali, berisi 1 blok/ })).toBeVisible();
    await shot(page, "01-teacher-blocks");
  });

  await test.step("…turns on JavaScript, writes the key and the tests, and checks the key passes them", async () => {
    await page.getByRole("tab", { name: /Tulis JavaScript/ }).click();
    await page.getByRole("button", { name: "Aktifkan JavaScript" }).click();
    await page.getByLabel("Nama fungsi").fill("jumlahPaku");
    await page.getByLabel("Parameter (pisahkan dengan koma)").fill("papan, pakuPerPapan");
    await page.getByLabel("Kunci jawaban JavaScript").fill(REFERENCE);
    for (const args of ["5, 4", "3, 2", "0, 9"]) {
      await page.getByRole("button", { name: "Tambah kasus uji" }).click();
      await page.getByLabel(/^Kasus \d+: argumen/).last().fill(args);
    }
    await page.getByRole("button", { name: "Isi hasil dari kunci" }).click();
    await expect(page.getByLabel("Hasil yang benar (return)").first()).toHaveValue("20");
    await page.getByRole("button", { name: "Uji kunci jawaban" }).click();
    await expect(page.getByText("3/3 kasus uji lolos")).toBeVisible();
    await expect(page.getByText("Tersimpan")).toBeVisible();
    await expect(page.getByText(/Soal lengkap\./)).toBeVisible();
    await shot(page, "02-teacher-javascript");
  });

  await test.step("…tries it as a student in a popup, then marks it ready", async () => {
    await page.getByRole("button", { name: "Coba sebagai siswa" }).click();
    const preview = page.getByRole("dialog", { name: title });
    await expect(preview.getByText("Pratinjau siswa · jawaban tidak disimpan")).toBeVisible();
    await arrange(page, preview, ["Mulai: ketika mulai", "Ulangi: ulangi 5 kali", "Langkah: pasang 4 paku"], "Langkah: pasang 4 paku");
    await preview.getByRole("button", { name: "Periksa jawaban" }).click();
    await expect(preview.getByText(/Sempurna!/)).toBeVisible();
    await shot(page, "03-teacher-preview");
    await preview.getByRole("button", { name: "Tutup" }).click();
    await page.getByRole("button", { name: "Tandai siap" }).click();
    await expect(page.getByText("Siap dipakai")).toBeVisible();
  });

  // ---- the class --------------------------------------------------------------------------------------------------
  const api = await teacherApi(request);
  await api.endLiveSessions();
  const { session } = await api.post<{ session: { id: string; join_code: string } }>("/sessions", { class_code: ACCOUNTS.classCode });
  const [one, two] = await Promise.all(ACCOUNTS.students.map((s) => person(browser, { username: s.username })));

  await test.step("two students join, and the teacher starts the class", async () => {
    await page.goto(`/teacher/sessions/${session.id}`);
    await Promise.all([joinWithPin(one.page, session.id, session.join_code), joinWithPin(two.page, session.id, session.join_code)]);
    await expect(page.getByText(ACCOUNTS.students[1].name, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Mulai sesi" }).click();
    await expect(one.page.getByRole("heading", { name: "Papan kelas" })).toBeVisible();
    await expect(two.page.getByRole("heading", { name: "Papan kelas" })).toBeVisible();
  });

  const results = page.getByRole("dialog", { name: title });

  await test.step("the teacher sends the problem, and it pops up on both students' screens at once", async () => {
    await page.getByRole("button", { name: "Kirim soal ke siswa" }).click();
    const picker = page.getByRole("dialog").filter({ hasText: "Kirim soal ke siswa" });
    await picker.getByRole("button", { name: `Kirim ${title}` }).click();
    await expect(results.getByText("Pantau langsung")).toBeVisible();
    await expect(one.page.getByRole("dialog", { name: title })).toBeVisible();
    await expect(two.page.getByRole("dialog", { name: title })).toBeVisible();
    await expect(results.getByRole("row", { name: /Siswa Satu.*Mengerjakan/ })).toBeVisible(); // opening the popup starts the work
    await shot(one.page, "04-student-popup");
  });

  await test.step("at the same time: one student solves it with blocks, the other with JavaScript", async () => {
    const blocks = async () => {
      const dialog = one.page.getByRole("dialog", { name: title });
      await arrange(one.page, dialog, ["Mulai: ketika mulai", "Langkah: cat papan merah"]);
      await dialog.getByRole("button", { name: "Periksa jawaban" }).click();
      await expect(dialog.getByText("Hampir! Periksa lagi blok yang ditandai.")).toBeVisible();
      await expect(dialog.getByText("1 tidak diperlukan")).toBeVisible();
      await dialog.getByRole("button", { name: "Ulangi", exact: true }).click();
      await arrange(one.page, dialog, ["Mulai: ketika mulai", "Ulangi: ulangi 5 kali", "Langkah: pasang 4 paku"], "Langkah: pasang 4 paku");
      await dialog.getByRole("button", { name: "Periksa jawaban" }).click();
      await expect(dialog.getByText("Berhasil! Masalah terpecahkan setelah 2 kali mencoba.")).toBeVisible();
      await shot(one.page, "05-student-blocks-solved");
    };
    const code = async () => {
      const dialog = two.page.getByRole("dialog", { name: title });
      await dialog.getByRole("tab", { name: /Tulis JavaScript/ }).click();
      const editor = dialog.getByLabel("Kode JavaScript untuk jumlahPaku");
      await expect(editor).toHaveValue(/function jumlahPaku\(papan, pakuPerPapan\)/);
      await editor.fill("function jumlahPaku(papan, pakuPerPapan) {\n  return papan + pakuPerPapan;\n}\n");
      await dialog.getByRole("button", { name: "Jalankan tes" }).click();
      await expect(dialog.getByText("0/3 kasus uji lolos")).toBeVisible();
      await expect(dialog.getByText("hasilmu: 9").first()).toBeVisible();
      await editor.fill("function jumlahPaku(papan, pakuPerPapan) {\n  return papan * pakuPerPapan;\n}\n");
      await dialog.getByRole("button", { name: "Jalankan tes" }).click();
      await expect(dialog.getByText("3/3 kasus uji lolos")).toBeVisible();
      await expect(dialog.getByText("Berhasil! Masalah terpecahkan setelah 2 kali mencoba.")).toBeVisible();
      await shot(two.page, "06-student-code-solved");
    };
    await Promise.all([blocks(), code()]);
  });

  await test.step("the teacher sees, live, who solved it and how, and reads the JavaScript", async () => {
    await expect(results.getByText("2/2")).toBeVisible();
    await expect(results.getByRole("row", { name: /Siswa Satu.*Selesai.*Blok.*2× periksa blok/ })).toBeVisible();
    await expect(results.getByRole("row", { name: /Siswa Dua.*Selesai.*JavaScript.*2× jalankan kode/ })).toBeVisible();
    await results.getByRole("button", { name: "Lihat kode" }).click();
    await expect(results.getByText("return papan * pakuPerPapan;")).toBeVisible();
    await shot(page, "07-teacher-results");
  });

  await test.step("a student can minimise the popup and come back to their solved work", async () => {
    const dialog = one.page.getByRole("dialog", { name: title });
    await dialog.getByRole("button", { name: "Kecilkan soal" }).click();
    await expect(dialog).toBeHidden();
    await one.page.getByRole("button", { name: "Buka lagi" }).or(one.page.getByRole("button", { name: "Kerjakan soal" })).click();
    await expect(one.page.getByRole("dialog", { name: title }).getByText("Selesai dengan Blok")).toBeVisible();
  });

  await test.step("the teacher closes the problem; students can still read it but no longer answer", async () => {
    await results.getByRole("button", { name: "Tutup soal" }).click();
    await expect(results.getByText("Ditutup", { exact: true })).toBeVisible();
    await expect(two.page.getByRole("dialog", { name: title }).getByText("Guru sudah menutup soal ini.", { exact: false })).toBeVisible();
    await expect(two.page.getByRole("dialog", { name: title }).getByRole("button", { name: "Jalankan tes" })).toBeDisabled();
    await results.getByRole("button", { name: "Tutup" }).click();
    await expect(page.getByRole("region", { name: "Soal pemecahan masalah" }).getByText(/1 soal sudah ditutup/)).toBeVisible();
  });

  await api.post(`/sessions/${session.id}/end`);
  await Promise.all([teacher.close(), one.close(), two.close()]);
});

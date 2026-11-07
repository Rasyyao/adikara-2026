import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { ACCOUNTS, API_URL } from "./env";

/** Logs in through the login page, as a teacher (email) or a student (username). */
export async function login(page: Page, as: { email: string } | { username: string }) {
  await page.goto("/login");
  if ("email" in as) {
    await page.getByRole("group").getByText("Guru", { exact: true }).click(); // the role toggle, not the preview picture
    await page.getByLabel("Email").fill(as.email);
  } else {
    await page.getByRole("group").getByText("Siswa", { exact: true }).click();
    await page.getByLabel("Nama pengguna").fill(as.username);
  }
  await page.getByRole("textbox", { name: "Kata sandi" }).fill(ACCOUNTS.password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL("email" in as ? /\/teacher/ : /\/student/);
}

/** Joins a session from the student dashboard: "Masuk sesi", the PIN typed box by box, then into the waiting room. */
export async function joinWithPin(page: Page, sessionId: string, pin: string) {
  await page.getByRole("button", { name: "Masuk sesi" }).first().click();
  await page.getByRole("group", { name: "PIN sesi, 6 angka" }).getByRole("textbox").first().click();
  await page.keyboard.type(pin, { delay: 30 });
  const submit = page.getByRole("dialog").getByRole("button", { name: /Masuk/ });
  if (await submit.isEnabled()) await submit.click().catch(() => {}); // a full PIN may already have sent the form
  await expect(page).toHaveURL(new RegExp(`/student/sessions/${sessionId}`));
}

/** A new browser window with its own cookies: one per person in the class. */
export async function person(browser: Browser, as: { email: string } | { username: string }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, as);
  return {
    context,
    page,
    /** Leaves the page first, so its open event stream ends cleanly before the window closes. */
    async close() {
      await page.goto("about:blank").catch(() => {});
      await context.close();
    },
  };
}

/** The API as the teacher, for setting up what the UI does not offer in a test (a quiz needs an AI-written test). */
export async function teacherApi(request: APIRequestContext) {
  const response = await request.post(`${API_URL}/auth/login`, { data: { email: ACCOUNTS.teacher.email, password: ACCOUNTS.password } });
  expect(response.ok()).toBeTruthy();
  const { access_token } = (await response.json()) as { access_token: string };
  const headers = { Authorization: `Bearer ${access_token}` };
  const call = async <T>(method: "get" | "post", path: string, data?: unknown): Promise<T> => {
    const res = await request[method](`${API_URL}${path}`, { headers, ...(data === undefined ? {} : { data }) });
    expect(res.ok(), `${method.toUpperCase()} ${path}: ${res.status()} ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  };
  return {
    get: <T>(path: string) => call<T>("get", path),
    post: <T>(path: string, data: unknown = {}) => call<T>("post", path, data),
    /** Ends every session still running, so the class can start a new one. */
    async endLiveSessions() {
      const { items } = await call<{ items: { session: { id: string } }[] }>("get", "/sessions?status=live");
      for (const { session } of items) await call("post", `/sessions/${session.id}/end`, {});
    },
  };
}

/** The quiz every spec uses: two questions, B and B. */
export const QUIZ = {
  title: "Pre-Test Variabel",
  kind: "pretest",
  questions: [
    {
      question: "x = 5, lalu x = 7. Berapa isi x sekarang?",
      options: [
        { key: "A", text: "5" },
        { key: "B", text: "7" },
        { key: "C", text: "12" },
      ],
      answer: "B",
      explanation: "Nilai baru menimpa nilai lama.",
    },
    {
      question: "Tipe data dari 3.5 adalah?",
      options: [
        { key: "A", text: "int" },
        { key: "B", text: "float" },
      ],
      answer: "B",
      explanation: "Bilangan berkoma adalah float.",
    },
  ],
};

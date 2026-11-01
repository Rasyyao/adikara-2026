import { readFileSync } from "node:fs";
import { join } from "node:path";

// The end-to-end tests run their own API and web server on the test database, never on the development one.

export const API_PORT = 8090;
export const WEB_PORT = 3100;
export const API_URL = `http://localhost:${API_PORT}/api/v1`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

/** The seeded development accounts (apps/api/prisma/seed.ts), created again in the test database before every run. */
export const ACCOUNTS = {
  password: "ChangeMe-123",
  teacher: { email: "guru@example.com", name: "Bu Guru" },
  students: [
    { username: "siswa.satu", name: "Siswa Satu" },
    { username: "siswa.dua", name: "Siswa Dua" },
  ],
  classCode: "KELAS7A",
} as const;

/** TEST_DATABASE_URL from the root .env (or the environment); refuses any database whose name does not end in _test. */
export function testDatabaseUrl(): string {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    try {
      const env = readFileSync(join(__dirname, "../../../.env"), "utf8");
      url = /^TEST_DATABASE_URL=(.*)$/m.exec(env)?.[1]?.trim();
    } catch {
      // no .env
    }
  }
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example). The end-to-end tests need their own database.");
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith("_test")) throw new Error(`Refusing to run end-to-end tests on "${name}": its name must end in _test.`);
  return url;
}

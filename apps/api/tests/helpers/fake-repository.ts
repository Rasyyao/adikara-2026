// The fakes now live in fake-database.ts (one in-memory database for every role). This file keeps the old import path working.
export { IDS, PASSWORDS, createFakeDatabase as createFakeRepository } from "./fake-database.js";
export type { FakeDatabase as FakeRepository } from "./fake-database.js";

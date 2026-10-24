import { createTokenService } from "../../src/lib/token.js";
import { createServices, type ServiceOptions } from "../../src/services/index.js";
import { TEST_SECRET } from "./config.js";
import { createFakeDatabase } from "./fake-database.js";

/** Real services on the in-memory database, without HTTP. For service-level tests. */
export async function buildServices(session: ServiceOptions["session"] = {}, storage?: ServiceOptions["storage"]) {
  const db = await createFakeDatabase();
  const tokens = createTokenService({ secret: TEST_SECRET, ttlSeconds: 3600 });
  const services = await createServices(db.repositories, tokens, { bcryptCost: 4, session, storage });
  return { db, tokens, services };
}

/** The error a rejected promise carries. */
export async function failure(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error("expected rejection");
    },
    (err) => err as { status: number; code: string; message: string; details?: Record<string, unknown> },
  );
}

import type { ObjectStorage } from "../../src/lib/storage.js";

/** Object storage in memory, to see what a route stored. `failNext` makes the next put reject, like an R2 outage. */
export function createMemoryStorage() {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const state = { failNext: false };
  const storage: ObjectStorage & { objects: typeof objects; state: typeof state } = {
    objects,
    state,
    async put(key, body, contentType) {
      if (state.failNext) {
        state.failNext = false;
        throw new Error("storage down");
      }
      objects.set(key, { body, contentType });
    },
    async remove(key) {
      objects.delete(key);
    },
  };
  return storage;
}

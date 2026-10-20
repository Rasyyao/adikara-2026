import { ref } from "../docs/schemas.js";
import type { ResponseDoc } from "./types.js";

/** A documented error response with a code, for the Swagger responses of a route. */
export function errorDoc(code: string, description: string, message = description): ResponseDoc {
  return { description, schema: ref("ErrorResponse"), example: { error: { code, message } } };
}

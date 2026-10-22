/** An error answer from the Adikara API (`{ error: { code, message, details } }`), or a failure to reach it. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Field problems from a 400 `validation_error`: `{ email: "must be a valid email address" }`. */
  get fields(): Record<string, string> {
    const fields = this.details.fields;
    return typeof fields === "object" && fields !== null ? (fields as Record<string, string>) : {};
  }
}

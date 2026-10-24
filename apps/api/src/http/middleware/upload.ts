import type { RequestHandler } from "express";
import multer from "multer";
import { AppError } from "../errors.js";
import { labelled } from "./label.js";

/**
 * Reads one optional multipart file called `file` into memory. Requests that are not multipart (plain JSON) pass through.
 * The size limit is enforced while streaming, so an oversized upload is cut off instead of buffered.
 */
export function createUpload(maxBytes: number): RequestHandler {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 5, fieldSize: 16 * 1024, parts: 8 },
  }).single("file");

  return labelled("upload:file", (req, res, next) => {
    parse(req, res, (err?: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          const mb = Math.floor(maxBytes / (1024 * 1024));
          return next(new AppError(413, "file_too_large", `File is too large (maximum ${mb} MB)`));
        }
        const field = err.code === "LIMIT_UNEXPECTED_FILE" ? "file" : "body";
        const reason = err.code === "LIMIT_UNEXPECTED_FILE" ? "send one file in the field 'file'" : "the form has too many or too large parts";
        return next(new AppError(400, "validation_error", "Request validation failed", { fields: { [field]: reason } }));
      }
      // a broken multipart body (bad boundary, cut-off upload)
      return next(new AppError(400, "invalid_multipart", "Request body is not valid multipart form data"));
    });
  });
}

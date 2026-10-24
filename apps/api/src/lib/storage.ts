import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageConfig } from "../config/index.js";
import { AppError } from "../http/errors.js";

/** Where uploaded materials live. The key is stored in `materials.file_path`; the Python worker reads the same bucket. */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const unavailable = () => new AppError(503, "storage_unavailable", "File storage is not configured");

/** Cloudflare R2 through its S3 API. With no config every call answers 503, so the rest of the API still works. */
export function createObjectStorage(config: StorageConfig | null): ObjectStorage {
  if (!config) {
    return {
      async put() {
        throw unavailable();
      },
      async remove() {},
    };
  }
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}

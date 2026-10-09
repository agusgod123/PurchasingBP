import "server-only";
import { env } from "@/server/env";
import { LocalStorageDriver } from "@/server/storage/local";
import { SupabaseStorageDriver } from "@/server/storage/supabase";

export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

export interface StorageDriver {
  readonly name: "local" | "supabase";
  /** URL tempat browser mengunggah file secara langsung (melewati batas body serverless). */
  createUploadTarget(key: string, contentType: string, documentId: string): Promise<UploadTarget>;
  /** Membaca seluruh isi objek (untuk verifikasi tipe & checksum, ukuran dibatasi). */
  read(key: string): Promise<Buffer | null>;
  /** Menulis objek dari server. */
  write(key: string, data: Buffer, contentType: string): Promise<void>;
  /** URL unduhan bertanda tangan berumur pendek, atau null jika harus di-stream lewat server. */
  createDownloadUrl(key: string, filename: string, expiresInSeconds: number): Promise<string | null>;
  remove(key: string): Promise<void>;
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (driver) return driver;
  const e = env();
  if (e.STORAGE_DRIVER === "supabase") {
    if (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("STORAGE_DRIVER=supabase membutuhkan SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.");
    }
    driver = new SupabaseStorageDriver(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, e.SUPABASE_STORAGE_BUCKET);
  } else {
    driver = new LocalStorageDriver(e.STORAGE_LOCAL_PATH);
  }
  return driver;
}

export { signUploadToken, verifyUploadToken } from "@/server/storage/tokens";

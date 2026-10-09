import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageDriver, UploadTarget } from "@/server/storage";
import { signUploadToken } from "@/server/storage/tokens";

/** Penyimpanan di folder privat server (development / server kantor dengan Docker). */
export class LocalStorageDriver implements StorageDriver {
  readonly name = "local" as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    // Cegah path traversal: key hanya boleh berisi segmen aman.
    if (!/^[A-Za-z0-9/_.-]+$/.test(key) || key.includes("..")) throw new Error("Storage key tidak valid");
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Storage key di luar direktori penyimpanan");
    return full;
  }

  async createUploadTarget(_key: string, contentType: string, documentId: string): Promise<UploadTarget> {
    const token = signUploadToken(documentId, Date.now() + 15 * 60_000);
    return {
      url: `/api/files/upload/${documentId}?token=${encodeURIComponent(token)}`,
      method: "PUT",
      headers: { "content-type": contentType },
    };
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch {
      return null;
    }
  }

  async write(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data, { mode: 0o600 });
  }

  async createDownloadUrl(): Promise<string | null> {
    return null;
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

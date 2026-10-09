import { StorageClient } from "@supabase/storage-js";
import type { StorageDriver, UploadTarget } from "@/server/storage";

/**
 * Supabase Storage (bucket PRIVAT). Kunci service role hanya dipakai di server.
 * Browser mengunggah langsung ke signed upload URL sehingga file besar tidak
 * melewati fungsi serverless (batas body Vercel 4,5 MB).
 */
export class SupabaseStorageDriver implements StorageDriver {
  readonly name = "supabase" as const;
  private readonly client: StorageClient;

  constructor(
    supabaseUrl: string,
    serviceRoleKey: string,
    private readonly bucket: string,
  ) {
    this.client = new StorageClient(`${supabaseUrl.replace(/\/$/, "")}/storage/v1`, {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    });
  }

  private get bucketApi() {
    return this.client.from(this.bucket);
  }

  async createUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
    const { data, error } = await this.bucketApi.createSignedUploadUrl(key);
    if (error || !data) throw new Error(`Gagal membuat URL unggah: ${error?.message ?? "tidak diketahui"}`);
    return {
      url: data.signedUrl,
      method: "PUT",
      headers: { "content-type": contentType, "x-upsert": "false", "cache-control": "max-age=3600" },
    };
  }

  async read(key: string): Promise<Buffer | null> {
    const { data, error } = await this.bucketApi.download(key);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  async write(key: string, data: Buffer, contentType: string): Promise<void> {
    const { error } = await this.bucketApi.upload(key, data, { contentType, upsert: false });
    if (error) throw new Error(`Gagal menyimpan file: ${error.message}`);
  }

  async createDownloadUrl(key: string, filename: string, expiresInSeconds: number): Promise<string | null> {
    const { data, error } = await this.bucketApi.createSignedUrl(key, expiresInSeconds, { download: filename });
    if (error || !data) throw new Error(`Gagal membuat URL unduhan: ${error?.message ?? "tidak diketahui"}`);
    return data.signedUrl;
  }

  async remove(key: string): Promise<void> {
    await this.bucketApi.remove([key]);
  }
}

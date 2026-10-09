"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FileImage, FileSpreadsheet, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOCUMENT_TYPE } from "@/lib/status";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { completeUploadAction, deleteDocumentAction, requestUploadAction } from "@/app/(app)/documents-actions";
import type { DocumentType } from "@/generated/prisma/enums";
import type { DocumentParentType } from "@/server/modules/documents/service";

export interface DocItem {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  documentType: DocumentType;
  uploadedByName: string;
  createdAt: string | Date;
  canDelete?: boolean;
}

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function mimeOf(file: File): string {
  if (file.type && Object.values(EXT_MIME).includes(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? file.type ?? "application/octet-stream";
}

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <FileImage className="size-4 text-violet-500" />;
  if (mime.includes("spreadsheet")) return <FileSpreadsheet className="size-4 text-emerald-600" />;
  return <FileText className="size-4 text-blue-600" />;
}

function putWithProgress(url: string, headers: Record<string, string>, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Unggah gagal (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Koneksi terputus saat mengunggah."));
    xhr.send(file);
  });
}

export function DocumentsPanel({
  parentType,
  parentId,
  documents,
  uploadTypes = [],
  emptyText = "Belum ada dokumen.",
  compact = false,
}: {
  parentType: DocumentParentType;
  parentId: string;
  documents: DocItem[];
  /** Jenis dokumen yang boleh diunggah; kosong = tidak bisa mengunggah. */
  uploadTypes?: DocumentType[];
  emptyText?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<DocumentType | undefined>(uploadTypes[0]);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length || !docType) return;
    for (const file of Array.from(files)) {
      setUploading({ name: file.name, progress: 0 });
      try {
        const reg = await requestUploadAction({
          parentType,
          parentId,
          documentType: docType,
          filename: file.name,
          sizeBytes: file.size,
          mimeType: mimeOf(file),
        });
        if (!reg.ok) {
          toast.error(`${file.name}: ${reg.error}`);
          continue;
        }
        await putWithProgress(reg.data.upload.url, reg.data.upload.headers, file, (p) => setUploading({ name: file.name, progress: p }));
        const done = await completeUploadAction(reg.data.documentId);
        if (done.ok) toast.success(`${file.name} terunggah.`);
        else toast.error(`${file.name}: ${done.error}`);
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "Gagal mengunggah"}`);
      }
    }
    setUploading(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  };

  const remove = async (id: string) => {
    const res = await deleteDocumentAction(id);
    if (res.ok) {
      toast.success("Dokumen dihapus.");
      router.refresh();
    } else toast.error(res.error);
  };

  return (
    <div className="space-y-3">
      {documents.length === 0 && !uploadTypes.length && <p className="text-sm text-muted-foreground">{emptyText}</p>}
      {documents.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
              <FileIcon mime={d.mimeType} />
              <div className="min-w-0 flex-1">
                <a href={`/api/files/${d.id}`} className="block truncate text-sm font-medium hover:underline" target="_blank" rel="noreferrer">
                  {d.originalFilename}
                </a>
                <div className="truncate text-xs text-muted-foreground">
                  {DOCUMENT_TYPE[d.documentType]} · {sizeLabel(d.sizeBytes)}
                  {!compact && ` · ${d.uploadedByName} · ${formatDateTime(d.createdAt)}`}
                </div>
              </div>
              <Button variant="ghost" size="icon" asChild aria-label="Unduh">
                <a href={`/api/files/${d.id}`} target="_blank" rel="noreferrer">
                  <Download className="size-4" />
                </a>
              </Button>
              {d.canDelete && (
                <Button variant="ghost" size="icon" onClick={() => remove(d.id)} aria-label="Hapus dokumen">
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {uploadTypes.length > 0 && (
        <div
          className={cn(
            "rounded-lg border border-dashed p-3 transition-colors",
            uploading ? "bg-muted/40" : "hover:border-primary/50",
          )}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFiles(e.dataTransfer.files);
          }}
        >
          {uploading ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Paperclip className="size-4" /> <span className="truncate">{uploading.name}</span>
                <span className="ml-auto tabular text-muted-foreground">{uploading.progress}%</span>
              </div>
              <Progress value={uploading.progress} />
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {uploadTypes.length > 1 && (
                <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
                  <SelectTrigger size="sm" className="sm:w-56">
                    <SelectValue placeholder="Jenis dokumen" />
                  </SelectTrigger>
                  <SelectContent>
                    {uploadTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {DOCUMENT_TYPE[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                <Upload className="size-4" /> Unggah {uploadTypes.length === 1 ? DOCUMENT_TYPE[uploadTypes[0]].toLowerCase() : "dokumen"}
              </Button>
              <span className="text-xs text-muted-foreground">atau seret file ke sini · PDF, JPG, PNG, WEBP, XLSX, DOCX</span>
              <input
                ref={inputRef}
                type="file"
                multiple
                hidden
                accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.docx"
                onChange={(e) => void onFiles(e.target.files)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

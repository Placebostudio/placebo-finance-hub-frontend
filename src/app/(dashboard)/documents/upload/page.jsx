"use client";
import React, { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import {
  Upload, FileText, Image as ImageIcon, Camera,
  CheckCircle2, AlertCircle, Loader2, Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/layout/page-header";
import { documentService } from "@/services/document.service";
import { documentRepository } from "@/services/backend-documents";
import { documentAttachmentRepository } from "@/services/backend-document_attachments";
import { documentExtractionRepository } from "@/services/backend-document_extractions";
import { auditRepository } from "@/services/backend-audits";
import { userRepository } from "@/services/backend-users";
import { useAuthStore } from "@/store/auth";
import { cn, formatFileSize } from "@/lib/utils";
import { APP_CONFIG } from "@/config";
import { toast } from "sonner";

const MAX_SIZE = APP_CONFIG.maxFileSize;

/** Human-readable label for each extraction stage. */
function stageLabel(stage, detail) {
  if (stage === "pdf") return detail ?? "Reading PDF…";
  if (stage === "render") return detail ?? "Rendering pages…";
  if (stage === "ocr") return detail ?? "Running OCR…";
  if (stage === "parsing") return "Parsing fields…";
  if (stage === "done") return "Extraction complete";
  return detail ?? "Processing…";
}

export default function UploadPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const cameraRef = useRef(null);
  const [queue, setQueue] = useState([]);

  const processFile = useCallback(async (file, queueId) => {

    // ============================================================
    // PHASE 1 — UPLOAD FILE + CREATE DOCUMENT
    // ============================================================

    setQueue((q) =>
      q.map((i) =>
        i.id === queueId
          ? {
            ...i,
            status: "uploading",
            progress: 5,
            stage: "Uploading…"
          }
          : i
      )
    );

    let doc;

    try {

      // ==========================================================
      // documentRepository.upload()
      //
      // 1. Uploads the actual file to Supabase Storage
      // 2. Creates the documents row
      // 3. Creates the document audit log
      // ==========================================================

      doc = await documentRepository.upload(
        file,
        user?.id
      );

    } catch (err) {

      console.error(
        "Upload failed:",
        err
      );

      setQueue((q) =>
        q.map((i) =>
          i.id === queueId
            ? {
              ...i,
              status: "error",
              progress: 0,
              stage: "Upload failed"
            }
            : i
        )
      );

      return;
    }


    // ============================================================
    // DOCUMENT CREATED
    // ============================================================

    setQueue((q) =>
      q.map((i) =>
        i.id === queueId
          ? {
            ...i,
            progress: 30,
            stage: "Saved — starting extraction…",
            docId: doc.id
          }
          : i
      )
    );


    // ============================================================
    // PHASE 2 — OCR / EXTRACTION
    // ============================================================

    setQueue((q) =>
      q.map((i) =>
        i.id === queueId
          ? {
            ...i,
            status: "extracting",
            progress: 32,
            stage: "Extracting…"
          }
          : i
      )
    );


    try {

      // ==========================================================
      // LOAD OCR MODULE
      // ==========================================================

      const {
        extractReceipt
      } = await import(
        "@/services/extraction/document-extractor"
      );


      // ==========================================================
      // RUN OCR
      // ==========================================================

      const result = await extractReceipt(
        file,
        ({ stage, detail, percent }) => {

          const pct =
            30 +
            Math.round(percent * 0.65);


          setQueue((q) =>
            q.map((i) =>
              i.id === queueId
                ? {
                  ...i,
                  progress: pct,
                  stage: stageLabel(
                    stage,
                    detail
                  )
                }
                : i
            )
          );
        }
      );


      // ==========================================================
      // DETERMINE EXTRACTION METHOD
      // ==========================================================

      let method = "image_ocr";

      if (file.type === "application/pdf") {

        // If your extractor exposes whether the PDF
        // was text-based or scanned, use that here.
        //
        // For now, assume scanned PDF OCR.

        method = "scanned_pdf_ocr";
      }


      // ==========================================================
      // NORMALIZE OCR RESULT
      //
      // Your table expects:
      //
      // fields              JSONB NOT NULL
      // validation_issues   JSONB NOT NULL
      // full_text           TEXT
      // confidence         NUMERIC
      // duration_ms         INTEGER
      // is_current          BOOLEAN
      // spam                BOOLEAN
      // ==========================================================

      // ============================================================
      // PHASE 3 — CREATE DOCUMENT EXTRACTION
      // ============================================================

      const extraction = await documentExtractionRepository.create({
        document_id: doc.id,
        method: result.method,
        fields: result.fields,
        validation_issues: result.validationIssues ?? [],
        full_text: result.fullText ?? null,
        confidence: null,
        duration_ms: null,
        is_current: true,
        spam: false
      });


      // ============================================================
      // AUDIT LOG — DOCUMENT EXTRACTION
      //
      // document_extractions has no id column.
      //
      // Therefore the document UUID is used as the audit
      // entity_id for the extraction event.
      // ============================================================

      const currentUser =
        userRepository.getLoggedInUser();


      if (currentUser) {

        await auditRepository.create({

          actor_id:
            currentUser.id,

          action:
            "create",

          entity_type:
            "document_extraction",

          entity_id:
            doc.id,

          before:
            null,

          after:
            extraction,

          ip_address:
            null,

          user_agent:
            navigator.userAgent
        });
      }


      // ============================================================
      // FINISHED
      //
      // DO NOT CREATE EXPENSE HERE.
      //
      // Expense is created only after user review/approval.
      // ============================================================

      setQueue((q) =>
        q.map((i) =>
          i.id === queueId
            ? {
              ...i,
              status: "done",
              progress: 100,
              stage: "Ready for review"
            }
            : i
        )
      );

    } catch (err) {

      console.error(
        "Extraction failed:",
        err
      );


      // ============================================================
      // OCR FAILED
      //
      // The document remains in documents.
      //
      // No document_extractions row is created because
      // you specified that extraction should only be recorded
      // when OCR actually happens successfully.
      // ============================================================

      setQueue((q) =>
        q.map((i) =>
          i.id === queueId
            ? {
              ...i,
              status: "extraction_failed",
              progress: 100,
              stage:
                "Extraction failed — fill manually"
            }
            : i
        )
      );
    }

  }, [user]);


  const addFiles = useCallback(
    async (files) => {

      // ============================================================
      // VALIDATE FILES
      // ============================================================

      const valid = files.filter((f) => {

        if (f.size > MAX_SIZE) {

          toast.error(
            `${f.name} is too large (max ${formatFileSize(MAX_SIZE)})`
          );

          return false;
        }

        return true;
      });


      if (valid.length === 0) {
        return;
      }


      // ============================================================
      // CREATE QUEUE ITEMS
      // ============================================================

      const newItems = valid.map((f) => {

        const id =
          Math.random()
            .toString(36)
            .substring(2);


        const preview =
          f.type.startsWith("image/")
            ? URL.createObjectURL(f)
            : null;


        return {
          id,
          file: f,
          preview,
          status: "pending",
          progress: 0,
          stage: "Pending…",
          docId: null
        };
      });


      // ============================================================
      // ADD TO QUEUE
      // ============================================================

      setQueue((q) => [
        ...q,
        ...newItems
      ]);


      // ============================================================
      // PROCESS FILES SEQUENTIALLY
      // ============================================================

      for (const item of newItems) {

        await processFile(
          item.file,
          item.id
        );
      }

    },
    [processFile]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop: addFiles,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "application/pdf": [".pdf"],
    },
    maxSize: MAX_SIZE,
    multiple: true,
    onDropRejected: (rejected) => {
      rejected.forEach(({ file, errors }) => {
        const msg =
          errors[0]?.code === "file-too-large"
            ? `${file.name} is too large`
            : `${file.name}: invalid file type`;
        toast.error(msg);
      });
    },
  });

  const hasDone = queue.some((i) => i.status === "done" || i.status === "extraction_failed");

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Upload Documents"
        description="Upload receipts and invoices — text is extracted automatically"
        actions={
          hasDone && (
            <Button onClick={() => router.push("/documents/review")} size="sm">
              Go to Review Queue
            </Button>
          )
        }
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto max-w-2xl">
        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={cn(
            "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all",
            isDragActive && !isDragReject
              ? "border-primary bg-primary/5"
              : isDragReject
                ? "border-destructive bg-destructive/5"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
          )}
        >
          <input {...getInputProps()} />
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          {isDragActive && !isDragReject ? (
            <>
              <p className="text-lg font-semibold text-primary">Drop here!</p>
              <p className="text-sm text-muted-foreground mt-1">Release to upload</p>
            </>
          ) : isDragReject ? (
            <p className="text-lg font-semibold text-destructive">Invalid file type</p>
          ) : (
            <>
              <p className="text-lg font-semibold">Drag &amp; drop files here</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                JPEG, PNG, WebP, or PDF · max {formatFileSize(MAX_SIZE)}
              </p>
              <Button className="mt-4" variant="outline" size="sm" type="button">
                Browse Files
              </Button>
            </>
          )}
        </div>

        {/* Quick-access buttons */}
        <div className="grid grid-cols-3 gap-3">
          <div
            {...getRootProps()}
            className="flex items-center gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <input {...getInputProps()} />
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <ImageIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Image</p>
              <p className="text-xs text-muted-foreground">JPG, PNG, WebP</p>
            </div>
          </div>
          <div
            {...getRootProps()}
            className="flex items-center gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <input {...getInputProps()} />
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
              <FileText className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-medium">PDF</p>
              <p className="text-xs text-muted-foreground">Invoices</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex items-center gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <Camera className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Camera</p>
              <p className="text-xs text-muted-foreground">Take photo</p>
            </div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) addFiles(files);
                e.target.value = "";
              }}
            />
          </button>
        </div>

        {/* Queue list */}
        {queue.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Processing queue</h3>
            {queue.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  {item.preview ? (
                    <img
                      src={item.preview}
                      alt=""
                      className="h-10 w-10 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-muted flex-shrink-0">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.file.name}</p>
                    {(item.status === "uploading" || item.status === "extracting") ? (
                      <div className="mt-1 space-y-0.5">
                        <Progress value={item.progress} className="h-1.5" />
                        <p className="text-xs text-muted-foreground">{item.stage}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.status === "done" || item.status === "extraction_failed"
                          ? item.stage
                          : formatFileSize(item.file.size)}
                      </p>
                    )}
                  </div>

                  <div className="flex-shrink-0 flex items-center gap-2">
                    {item.status === "pending" && (
                      <Badge variant="secondary" className="text-xs">Pending</Badge>
                    )}
                    {(item.status === "uploading" || item.status === "extracting") && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {item.status === "done" && (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        {item.docId && (
                          <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2">
                            <a href={`/documents/review/${item.docId}`}>Review</a>
                          </Button>
                        )}
                      </>
                    )}
                    {item.status === "extraction_failed" && (
                      <>
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                        {item.docId && (
                          <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2">
                            <a href={`/documents/review/${item.docId}`}>Review manually</a>
                          </Button>
                        )}
                      </>
                    )}
                    {item.status === "error" && (
                      <Badge variant="destructive" className="text-xs">Upload error</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Info note */}
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30 p-3">
          <Zap className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-400">
            Fields are extracted automatically from digital PDFs and images.
            Scanned PDFs use OCR (requires internet on first run to load the OCR engine).
            You review and confirm all values before saving.
          </p>
        </div>
      </div>
    </div>
  );
}

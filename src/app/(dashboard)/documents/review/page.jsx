"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, ArrowRight, FileText, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { documentService } from "@/services/document.service";
import { documentRepository } from "@/services/backend-documents";
import { auditRepository } from "@/services/backend-audits";
import { useAuthStore } from "@/store/auth";
import { formatDate, formatFileSize } from "@/lib/utils";
import { toast } from "sonner";

export default function ReviewQueuePage() {
  const [docs, setDocs] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const { user: currentUser } = useAuthStore();

  async function load() {
    setDocs(
      await documentRepository.getAll({
        status: "pending_review"
      })
    );
  }

  useEffect(() => { load(); }, []);

  async function handleConfirmDelete() {
    const id = deletingId;
    setDeletingId(null);

    if (!id) return;

    try {
      const doc = await documentRepository.getById(id);

      if (!doc) {
        toast.error("Document not found");
        return;
      }

      await documentRepository.softDelete(id);

      toast.success("Document removed from queue");

      await load();

    } catch (err) {
      console.error("Failed to delete document:", err);

      toast.error(
        err.message || "Failed to delete document"
      );
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Review Queue"
        description={`${docs.length} document${docs.length !== 1 ? "s" : ""} awaiting review`}
      />

      <div className="flex-1 p-4 sm:p-6 overflow-auto">
        {docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <ClipboardCheck className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm">Review queue is empty</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/documents/upload">Upload a document</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {docs.map((doc) => (
              <Card key={doc.id} className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted flex-shrink-0">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatFileSize(doc.file_size)} · Uploaded {formatDate(doc.uploaded_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="warning" className="text-xs hidden sm:inline-flex">Pending Review</Badge>
                    <Button asChild size="sm">
                      <Link href={`/documents/review/${doc.id}`}>
                        Review <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive flex-shrink-0"
                      title="Remove from queue"
                      onClick={() => setDeletingId(doc.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Deletion confirmation dialog */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove document from queue?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the document and its extracted data from the review queue.
              {currentUser?.role === "owner"
                ? " As an owner, the file will be permanently deleted and cannot be recovered."
                : " The document will be moved to the spam queue for owner review."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

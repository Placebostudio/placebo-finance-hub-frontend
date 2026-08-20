"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, ArrowRight, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { documentService } from "@/services/document.service";
import { formatDate, formatFileSize } from "@/lib/utils";

export default function ReviewQueuePage() {
  const [docs, setDocs] = useState([]);

  useEffect(() => {
    setDocs(documentService.getPendingReview());
  }, []);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Review Queue"
        description={`${docs.length} document${docs.length !== 1 ? "s" : ""} awaiting review`}
      />

      <div className="flex-1 p-6 overflow-auto">
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
                    <p className="text-sm font-medium truncate">{doc.fileName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatFileSize(doc.fileSize)} · Uploaded {formatDate(doc.uploadedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge variant="warning" className="text-xs">Pending Review</Badge>
                    <Button asChild size="sm">
                      <Link href={`/documents/review/${doc.id}`}>
                        Review <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

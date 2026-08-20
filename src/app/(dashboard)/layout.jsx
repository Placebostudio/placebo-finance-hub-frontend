"use client";
import React from "react";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({ children }) {
  const { isAuthenticated } = useAuthGuard();

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

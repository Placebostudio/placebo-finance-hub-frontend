"use client";
import React from "react";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({ children }) {
  const { isAuthenticated, _hasHydrated } = useAuthGuard();

  // Auth state is still being restored from localStorage — show a neutral
  // loading indicator rather than redirecting or rendering protected content.
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Hydrated but unauthenticated — useAuthGuard has already fired the redirect
  // to /login. Render nothing while navigation completes.
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
    </div>
  );
}

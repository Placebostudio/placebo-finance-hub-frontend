"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";

/**
 * Enforces that the current user is authenticated AND has the 'owner' role.
 * Redirects to /login if not authenticated, or returns isOwner=false for UI
 * to render an unauthorized message.
 */
export function useOwnerGuard() {
  const { isAuthenticated, user } = useAuthStore();
  const router = useRouter();

  const isOwner = user?.role === "owner";

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, router]);

  return { isAuthenticated, user, isOwner };
}

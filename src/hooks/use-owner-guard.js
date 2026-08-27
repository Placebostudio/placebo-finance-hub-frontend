"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";

/**
 * Enforces that the current user is authenticated AND has the 'owner' role.
 * Redirects to /login (with returnTo) if not authenticated, or returns
 * isOwner=false for the UI to render an unauthorized message.
 */
export function useOwnerGuard() {
  const { isAuthenticated, user, _hasHydrated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  const isOwner = user?.role === "owner";

  useEffect(() => {
    // Do not act while the persisted session is still being read from localStorage.
    if (!_hasHydrated) return;

    if (!isAuthenticated) {
      router.push(`/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [_hasHydrated, isAuthenticated, router, pathname]);

  return { isAuthenticated, user, isOwner, _hasHydrated };
}

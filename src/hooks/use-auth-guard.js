"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";

export function useAuthGuard() {
  const { isAuthenticated, user, _hasHydrated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Do not act while the persisted session is still being read from localStorage.
    if (!_hasHydrated) return;

    if (!isAuthenticated) {
      router.push(`/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [_hasHydrated, isAuthenticated, router, pathname]);

  return { isAuthenticated, user, _hasHydrated };
}

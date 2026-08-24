"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOwnerGuard } from "@/hooks/use-owner-guard";

export default function ManagementPage() {
  const { isOwner } = useOwnerGuard();
  const router = useRouter();

  useEffect(() => {
    if (isOwner) {
      router.replace("/management/users");
    }
  }, [isOwner, router]);

  return null;
}

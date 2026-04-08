"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { isAuthenticated } from "./auth-storage";

export function useAuthRedirect() {
  const router = useRouter();
  const authenticated = isAuthenticated();

  useEffect(() => {
    if (!authenticated) {
      router.replace("/");
    }
  }, [authenticated, router]);

  return authenticated;
}

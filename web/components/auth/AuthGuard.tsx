"use client";

import { useEffect, useState, type PropsWithChildren } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api-client";
import { LoadingState } from "../ui";

export function AuthGuard({ children }: PropsWithChildren) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => { apiFetch("/api/session_status").then(() => setReady(true)).catch(() => router.replace("/login")); }, [router]);
  return ready ? children : <LoadingState label="正在验证登录状态" />;
}

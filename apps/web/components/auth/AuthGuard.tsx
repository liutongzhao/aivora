"use client";

import { useEffect, useState, type PropsWithChildren } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api-client";
import { LoadingState } from "../ui";

type SessionStatus = {
  user: {
    role: string;
  };
};

export function AuthGuard({ children, requiredRole }: PropsWithChildren<{ requiredRole?: string }>) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    apiFetch<SessionStatus>("/api/session_status")
      .then(({ user }) => {
        if (requiredRole && user.role !== requiredRole) {
          router.replace("/dashboard");
          return;
        }
        setReady(true);
      })
      .catch((error) => {
        if (error instanceof Error && error.message.includes("无法连接服务")) {
          setReady(true);
          return;
        }
        router.replace("/login");
      });
  }, [requiredRole, router]);
  return ready ? children : <LoadingState label="正在验证登录状态" />;
}

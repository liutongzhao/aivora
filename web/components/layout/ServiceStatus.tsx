"use client";

import { useEffect, useState } from "react";

export function ServiceStatus() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:18000"}/health/ready`)
      .then((response) => setStatus(response.ok ? "online" : "offline"))
      .catch(() => setStatus("offline"));
  }, []);
  const labels = { checking: "检测本地服务", online: "本地服务正常", offline: "本地服务不可用" };
  return <div className={`service-status service-status-${status}`}><span className="service-status-dot" />{labels[status]}</div>;
}

import type { PropsWithChildren } from "react";
import { BrandMark } from "../brand/BrandMark";
import { ServiceStatus } from "./ServiceStatus";

export function PublicShell({ children }: PropsWithChildren) {
  return <main className="public-shell"><div className="public-brand-panel"><BrandMark /><div className="public-intro"><h1>Aivora</h1><p>桌面截图、AI 处理、任务记录。</p></div><ServiceStatus /></div><div className="public-form-panel">{children}</div></main>;
}

import type { PropsWithChildren } from "react";
import { BrandMark } from "../brand/BrandMark";
import { ServiceStatus } from "./ServiceStatus";

export function PublicShell({ children }: PropsWithChildren) {
  return <main className="public-shell"><div className="public-brand-panel"><BrandMark /><div className="public-intro"><span className="eyebrow">LOCAL AI WORKSPACE</span><h1>把复杂任务，交给一套可靠的工作流。</h1><p>从桌面截图采集，到流式答案返回，Aivora 将每个步骤清晰地连接起来。</p></div><ServiceStatus /></div><div className="public-form-panel">{children}</div></main>;
}

import { Badge, Card } from "../ui";

export function ServiceHealthGrid({ checks }: { checks: Record<string, string> }) {
  return <Card className="service-health-grid"><div className="panel-heading"><div><span className="eyebrow">SYSTEM HEALTH</span><h2>服务状态</h2></div></div><div className="health-items">{Object.entries(checks).map(([name, status]) => <div className="health-item" key={name}><span>{name === "database" ? "PostgreSQL" : name === "minio" ? "MinIO" : "Redis"}</span><Badge tone={status === "ok" ? "success" : "danger"}>{status === "ok" ? "正常" : "异常"}</Badge></div>)}</div></Card>;
}

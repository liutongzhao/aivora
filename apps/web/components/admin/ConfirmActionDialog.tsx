import { Button } from "../ui";

export function ConfirmActionDialog({ title, description, onCancel, onConfirm, loading = false }: { title: string; description: string; onCancel: () => void; onConfirm: () => void; loading?: boolean }) {
  return <div className="dialog-backdrop" role="dialog" aria-modal="true"><div className="dialog-card motion-scale-in"><span className="eyebrow">CONFIRM ACTION</span><h2>{title}</h2><p>{description}</p><div className="dialog-actions"><Button variant="ghost" onClick={onCancel}>取消</Button><Button variant="danger" loading={loading} onClick={onConfirm}>确认</Button></div></div></div>;
}

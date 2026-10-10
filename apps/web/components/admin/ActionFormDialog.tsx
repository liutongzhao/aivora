import { FormEvent, ReactNode, useEffect } from "react";
import { Button } from "../ui";

export function ActionFormDialog({
  title,
  description,
  children,
  onCancel,
  onSubmit,
  loading = false,
  submitLabel = "确认操作",
}: {
  title: string;
  description: string;
  children: ReactNode;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  loading?: boolean;
  submitLabel?: string;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !loading) onCancel(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loading, onCancel]);

  return <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="action-dialog-title">
    <form className="dialog-card motion-scale-in action-form-dialog" onSubmit={onSubmit}>
      <span className="eyebrow">ADMIN ACTION</span>
      <h2 id="action-dialog-title">{title}</h2>
      <p>{description}</p>
      <div className="action-dialog-fields">{children}</div>
      <div className="dialog-actions"><Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>取消</Button><Button type="submit" loading={loading}>{submitLabel}</Button></div>
    </form>
  </div>;
}

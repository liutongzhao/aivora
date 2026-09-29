type ToastTone = "success" | "error" | "info";

export function Toast({
  tone,
  message,
  onDismiss,
}: {
  tone: ToastTone;
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className={`toast toast-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span>{message}</span>
      <button type="button" aria-label="关闭提示" onClick={onDismiss}><X size={16} /></button>
    </div>
  );
}
import { X } from "lucide-react";

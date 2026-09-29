import { CheckCircle2, Info, TriangleAlert, XCircle } from 'lucide-react'

export type ClientToastVariant = 'success' | 'error' | 'info' | 'warning'

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: TriangleAlert,
} as const

export function ClientToast({ message, variant = 'info' }: { message: string; variant?: ClientToastVariant }) {
  const Icon = icons[variant]
  return (
    <div className="client-status-toast-viewport" aria-live="polite">
      <div className={`client-status-toast is-${variant}`} role={variant === 'error' ? 'alert' : 'status'}>
        <Icon size={16} aria-hidden="true" />
        <span>{message}</span>
      </div>
    </div>
  )
}

import * as React from "react"
import * as ToastPrimitive from "@radix-ui/react-toast"
import { cn } from "../../lib/utils"
import { AlertCircle, CheckCircle2, Info, X, Clock, User } from "lucide-react"

const ToastProvider = ToastPrimitive.Provider

export type ToastMessage = {
  title: string
  description: string
  variant: ToastVariant
}

export type ToastVariant = "neutral" | "success" | "error" | "info" | "warning" | "loading"

interface ToastProps
  extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> {
  variant?: ToastVariant
  showProgress?: boolean
  onActionClick?: () => void
  actionText?: string
}

// 改进的Toast变体配置
const toastVariants: Record<
  ToastVariant,
  { icon: React.ReactNode; borderColor: string }
> = {
  neutral: {
    icon: <Info className="h-4 w-4 text-blue-400" />,
    borderColor: "border-blue-600"
  },
  info: {
    icon: <Info className="h-4 w-4 text-blue-400" />,
    borderColor: "border-blue-600"
  },
  success: {
    icon: <CheckCircle2 className="h-4 w-4 text-green-400" />,
    borderColor: "border-green-600"
  },
  error: {
    icon: <AlertCircle className="h-4 w-4 text-red-400" />,
    borderColor: "border-red-600"
  },
  warning: {
    icon: <AlertCircle className="h-4 w-4 text-amber-400" />,
    borderColor: "border-amber-600"
  },
  loading: {
    icon: <Clock className="h-4 w-4 text-purple-400 animate-spin" />,
    borderColor: "border-purple-600"
  }
}

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  ToastProps
>(({ className, variant = "neutral", showProgress, onActionClick, actionText, ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    duration={props.duration !== undefined ? props.duration : (variant === 'loading' ? 0 : 1000)} // 优先使用传入的duration，默认1秒自动消失
    className={cn(
      "group pointer-events-none relative flex w-full items-start space-x-3 overflow-hidden rounded-lg p-4 shadow-lg border transition-all duration-300",
      "client-toast",
      toastVariants[variant].borderColor,
      "data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full",
      "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full",
      className
    )}
    {...props}
  >
    {/* 图标区域 */}
    <div className="flex-shrink-0 mt-0.5">
      {toastVariants[variant].icon}
    </div>
    
    {/* 内容区域 */}
    <div className="flex-1 min-w-0">
      {props.children}
    </div>

    {/* 操作按钮（如果有） */}
    {actionText && onActionClick && (
      <ToastPrimitive.Action
        altText={actionText}
        onClick={onActionClick}
        className="flex-shrink-0 ml-3 px-3 py-1 text-sm font-medium rounded-md border border-transparent hover:bg-white/50 transition-colors"
      >
        {actionText}
      </ToastPrimitive.Action>
    )}

    {/* 关闭按钮 */}
    <ToastPrimitive.Close className="absolute right-2 top-2 rounded-md p-1 text-gray-400 opacity-0 transition-opacity hover:text-gray-600 group-hover:opacity-100 focus:opacity-100">
      <X className="h-3 w-3" />
    </ToastPrimitive.Close>

    {/* 进度条（如果启用） */}
    {showProgress && variant === 'loading' && (
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 overflow-hidden">
        <div className="h-full bg-purple-500 animate-pulse"></div>
      </div>
    )}
  </ToastPrimitive.Root>
))
Toast.displayName = ToastPrimitive.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-secondary focus:outline-none focus:ring-1 focus:ring-ring disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitive.Action.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitive.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn("text-sm opacity-90 mt-1", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitive.Description.displayName

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      "client-toast-viewport fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px] pointer-events-none",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitive.Viewport.displayName

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastAction,
}

export type { ToastProps }

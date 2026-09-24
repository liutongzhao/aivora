import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}>;

export function Button({ children, variant = "primary", loading = false, className = "", disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`ui-button ui-button-${variant} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading}
    >
      {loading && <span className="ui-spinner" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

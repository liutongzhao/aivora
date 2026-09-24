import { Button } from "./Button";

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="ui-error" role="alert"><strong>出了点问题</strong><p>{message}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>重试</Button>}</div>;
}

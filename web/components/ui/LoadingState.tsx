export function LoadingState({ label = "正在加载" }: { label?: string }) {
  return <div className="ui-loading" role="status"><span className="ui-spinner" aria-hidden="true" />{label}</div>;
}

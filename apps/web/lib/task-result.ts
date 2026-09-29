export type TaskResult = {
  content?: string;
  rawContent?: string;
  parsed?: Record<string, unknown>;
  parseWarning?: string | null;
  images?: { id: string; url: string; contentType?: string }[];
};

export function mergeTaskResult(current: TaskResult | null, incoming: TaskResult): TaskResult {
  return {
    ...(current ?? {}),
    ...incoming,
    images: incoming.images ?? current?.images,
  };
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export function buildRequestHeaders(
  input: HeadersInit | undefined,
  defaults: Record<string, string>,
): Headers {
  const headers = new Headers(input)
  for (const [name, value] of Object.entries(defaults)) {
    headers.set(name, value)
  }
  return headers
}

export async function fetchWithNetworkRetry(
  fetcher: Fetcher,
  input: string,
  init: RequestInit,
  maxAttempts = 3,
  retryDelayMs = 200,
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetcher(input, init)
    } catch (error) {
      lastError = error
      if (attempt === maxAttempts) break
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt))
    }
  }
  throw lastError
}

const DEFAULT_MAX_RETRIES = 10;
const MIN_REQUEST_GAP_MS = Number(process.env.APS_REQUEST_DELAY_MS ?? 300);
let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function throttleRequests(): Promise<void> {
  const now = Date.now();
  const waitMs = MIN_REQUEST_GAP_MS - (now - lastRequestAt);
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastRequestAt = Date.now();
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfterRaw = response.headers.get("retry-after");
  const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : Number.NaN;
  if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    return retryAfterSec * 1000;
  }
  return Math.min(120_000, 10_000 * 2 ** attempt);
}

export async function apsFetchJson<T>(
  token: string,
  url: string,
  options?: { maxRetries?: number },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  let attempt = 0;

  while (true) {
    await throttleRequests();

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 429 && attempt < maxRetries) {
      await sleep(retryDelayMs(response, attempt));
      attempt += 1;
      continue;
    }

    if (!response.ok) {
      const detail = await response.text();
      const quotaHint =
        response.status === 429
          ? " APS Data Management quota exceeded — wait a few minutes and retry, or scan with tip versions only (APS_INCLUDE_ALL_VERSIONS=false)."
          : "";
      throw new Error(`APS request failed (${response.status}): ${detail}${quotaHint}`);
    }

    return (await response.json()) as T;
  }
}

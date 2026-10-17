// Inlined by Metro at bundle time (SDD section 12); without it the phone would call itself. A copied port-forward URL
// often ends in "/", which would double the slash every path starts with.
export const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

const TIMEOUT_MS = 5000;

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Envelope<T> = { data: T; error: null } | { data: null; error: { code: string; message: string } };

type Init = { method?: string; body?: unknown; timeoutMs?: number };

// Every call goes through here: unwraps { data, error }, throws ApiError, never waits longer than its timeout.
// A charge blocks up to CHARGE_POLL_SECONDS plus wallet latency (SDD section 9), so it passes a longer timeoutMs.
export async function api<T>(path: string, init: Init = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${apiUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          'content-type': 'application/json',
          // Port-forward hosts (VS Code dev tunnels, ngrok) can answer with a browser warning page instead of the API.
          'X-Tunnel-Skip-AntiPhishing-Page': 'true',
          'ngrok-skip-browser-warning': '1',
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError('NETWORK', `Can't reach the service at ${apiUrl}`, 0);
    }
    const envelope = (await res.json().catch(() => null)) as Envelope<T> | null;
    if (res.ok && envelope?.error === null) return envelope.data;
    throw new ApiError(
      envelope?.error?.code ?? 'BAD_RESPONSE',
      envelope?.error?.message ?? `Unexpected response (HTTP ${res.status})`,
      res.status,
    );
  } finally {
    clearTimeout(timer);
  }
}

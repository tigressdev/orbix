export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) throw new ApiError((data as { error?: string } | null)?.error ?? res.statusText, res.status);
  return data as T;
}
export const api = {
  get: <T>(p: string) => call<T>('GET', p),
  post: <T>(p: string, b: unknown) => call<T>('POST', p, b),
  put: <T>(p: string, b: unknown) => call<T>('PUT', p, b),
};

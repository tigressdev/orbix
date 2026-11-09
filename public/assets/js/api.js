// Thin fetch wrappers for the local studio API.
async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) { const err = new Error((data && data.error) || res.statusText); err.status = res.status; throw err; }
  return data;
}
export const api = {
  get: (p) => call('GET', p),
  post: (p, b) => call('POST', p, b),
  put: (p, b) => call('PUT', p, b),
};

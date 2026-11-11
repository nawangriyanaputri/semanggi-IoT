const API_BASE = `${location.protocol}//${location.hostname}:3000/api`;

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers }
    });
  } catch {
    throw new Error("Tidak dapat menghubungi API di localhost:3000.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Permintaan gagal (${response.status}).`);
  return payload;
}

export const getLatest = () => request("/monitoring/latest");
export const getHistory = () => request("/monitoring/history");
export const getTrend = (from, to) => request(`/monitoring/trend?${new URLSearchParams({ from, to })}`);
export const getAnalysis = () => request("/analysis/prediction");
export const getSettings = () => request("/settings");
export const getHealth = () => request("/health");
export const saveSettings = settings => request("/settings", {
  method: "PUT",
  body: JSON.stringify(settings)
});

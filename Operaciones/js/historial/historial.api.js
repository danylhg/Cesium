const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;

export async function loadReplay(operationId) {
  return apiFetch(`/ops/${encodeURIComponent(operationId)}/replay`);
}

async function apiFetch(path) {
  const token = localStorage.getItem("token");
  const response = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || `Error HTTP ${response.status}`);
  }

  return payload;
}

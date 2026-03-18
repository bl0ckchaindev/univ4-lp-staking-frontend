const API_BASE = (import.meta.env.VITE_API_URL as string)?.replace(/\/$/, "") || "";
const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET as string | undefined;

function authHeaders(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (ADMIN_SECRET) h["Authorization"] = `Bearer ${ADMIN_SECRET}`;
  return h;
}

export async function getWhitelist(): Promise<string[]> {
  if (!API_BASE) return [];
  const res = await fetch(`${API_BASE}/whitelist`);
  if (!res.ok) throw new Error("Failed to fetch whitelist");
  const data = await res.json();
  return Array.isArray(data.addresses) ? data.addresses : [];
}

export async function addWhitelistAddress(address: string): Promise<void> {
  if (!API_BASE) return;
  const res = await fetch(`${API_BASE}/whitelist`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ address }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Failed to add to whitelist");
  }
}

export async function removeWhitelistAddress(address: string): Promise<void> {
  if (!API_BASE) return;
  const res = await fetch(`${API_BASE}/whitelist?address=${encodeURIComponent(address)}`, {
    method: "DELETE",
    headers: ADMIN_SECRET ? { Authorization: `Bearer ${ADMIN_SECRET}` } : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Failed to remove from whitelist");
  }
}

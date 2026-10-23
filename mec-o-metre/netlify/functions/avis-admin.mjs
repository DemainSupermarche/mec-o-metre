import { getStore } from "@netlify/blobs";

// Modération des avis. Protégé par la variable d'environnement ADMIN_KEY (réglages Netlify).
// GET  : avis en attente + avis publiés
// POST : { action: "publier" | "refuser" | "retirer", id }
const json = (o, status = 200) =>
  Response.json(o, { status, headers: { "cache-control": "no-store" } });

export default async (req) => {
  const cle = globalThis.Netlify?.env.get("ADMIN_KEY") ?? process.env.ADMIN_KEY;
  if (!cle || req.headers.get("x-admin-key") !== cle) return json({ error: "Clé incorrecte" }, 401);

  const store = getStore({ name: "avis", consistency: "strong" });
  const stats = async () => (await store.get("stats", { type: "json" })) || { sum: 0, count: 0 };

  if (req.method === "GET") {
    const charger = async (prefix) => {
      const { blobs } = await store.list({ prefix });
      const rows = await Promise.all(blobs.map(async (b) => ({
        id: b.key.slice(prefix.length), ...(await store.get(b.key, { type: "json" })),
      })));
      return rows.sort((a, b) => b.id.localeCompare(a.id));
    };
    return json({ attente: await charger("attente/"), publies: await charger("ok/"), stats: await stats() });
  }

  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: "Format invalide" }, 400); }
  const { action, id } = b;
  if (!/^[\w-]+$/.test(id || "")) return json({ error: "Identifiant invalide" }, 400);

  if (action === "publier") {
    const a = await store.get(`attente/${id}`, { type: "json" });
    if (!a) return json({ error: "Avis introuvable" }, 404);
    await store.setJSON(`ok/${id}`, a);
    await store.delete(`attente/${id}`);
    const s = await stats(); s.sum += a.note; s.count += 1;
    await store.setJSON("stats", s);
    return json({ ok: true });
  }
  if (action === "refuser") {
    await store.delete(`attente/${id}`);
    return json({ ok: true });
  }
  if (action === "retirer") {
    const a = await store.get(`ok/${id}`, { type: "json" });
    if (a) {
      await store.delete(`ok/${id}`);
      const s = await stats(); s.sum = Math.max(0, s.sum - a.note); s.count = Math.max(0, s.count - 1);
      await store.setJSON("stats", s);
    }
    return json({ ok: true });
  }
  return json({ error: "Action inconnue" }, 400);
};

export const config = { path: "/api/avis-admin" };

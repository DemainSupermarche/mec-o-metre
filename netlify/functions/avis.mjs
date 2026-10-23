import { getStore } from "@netlify/blobs";

// GET  /api/avis : moyenne, nombre d'avis et 30 derniers commentaires publiés
// POST /api/avis : { note: 1-3, texte?: string } -> note seule publiée tout de suite,
//                  commentaire mis en attente de relecture
const MAX = 400;
const json = (o, status = 200) =>
  Response.json(o, { status, headers: { "cache-control": "no-store" } });
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

export function masquer(t) {
  return t
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[masqué]")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[masqué]")
    .replace(/(?:\+?\d[\s.-]?){8,}/g, "[masqué] ")
    .replace(/@\w{2,}/g, "[masqué]")
    .trim();
}

async function stats(store) {
  return (await store.get("stats", { type: "json" })) || { sum: 0, count: 0 };
}

export default async (req) => {
  const store = getStore({ name: "avis", consistency: "strong" });

  if (req.method === "GET") {
    const s = await stats(store);
    const { blobs } = await store.list({ prefix: "ok/" });
    const keys = blobs.map((b) => b.key).sort().reverse().slice(0, 30);
    const items = (await Promise.all(keys.map((k) => store.get(k, { type: "json" }))))
      .filter(Boolean)
      .map((a) => ({ d: a.date, n: a.note, t: a.texte }));
    return json({ count: s.count, avg: s.count ? s.sum / s.count : 0, items });
  }

  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  let b;
  try { b = await req.json(); } catch { return json({ error: "Format invalide" }, 400); }
  if (b.site) return json({ status: "ok" }); // robot (champ piège rempli)

  const note = Number(b.note);
  if (![1, 2, 3].includes(note)) return json({ error: "Note invalide" }, 400);
  const texte = masquer(String(b.texte || "").replace(/\s+/g, " ").trim().slice(0, MAX));

  if (!texte) {
    const s = await stats(store);
    s.sum += note; s.count += 1;
    await store.setJSON("stats", s);
    return json({ status: "ok" });
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await store.setJSON(`attente/${id}`, { note, texte, date: today() });
  return json({ status: "pending" });
};

export const config = { path: "/api/avis" };

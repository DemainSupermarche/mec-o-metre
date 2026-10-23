import { getStore } from "@netlify/blobs";

// GET : renvoie le total. POST : ajoute un quiz terminé et renvoie le total.
export default async (req) => {
  const store = getStore("mec-o-metre");
  let total = parseInt((await store.get("quiz-termines")) || "0", 10) || 0;
  if (req.method === "POST") {
    total += 1;
    await store.set("quiz-termines", String(total));
  }
  return Response.json({ total }, { headers: { "cache-control": "no-store" } });
};

export const config = { path: "/api/compteur" };

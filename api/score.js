export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { player, score } = req.body || {};
  if (!player || typeof score !== "number") {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  res.status(200).json({ ok: true });
}

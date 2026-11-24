// Guarda quais versos da Carta 10 cada convidado escolheu.
// Usa o banco Upstash (Redis) conectado ao projeto na Vercel.
const KEY = "carta10:escolhas";
const PESSOAS = ["lucas", "pedro", "gabriel"];
const VERSO = /^verso-\d{1,2}$/;
const FIXOS = ["verso-1"]; // versos que já têm dono (VitchBeats) e não podem ser escolhidos

async function redis(cmd) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("banco não conectado");
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

async function todas() {
  const arr = (await redis(["HGETALL", KEY])) || [];
  const o = {};
  for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
  return o;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") return res.status(200).json({ escolhas: await todas() });
    if (req.method !== "POST") return res.status(405).json({ erro: "método não permitido" });

    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body || "{}");
    const { pessoa, parte, acao } = body || {};
    if (!PESSOAS.includes(pessoa) || !VERSO.test(parte || "") || FIXOS.includes(parte)) {
      return res.status(400).json({ erro: "dados inválidos" });
    }

    if (acao === "escolher") {
      const ok = await redis(["HSETNX", KEY, parte, pessoa]);
      let esc = await todas();
      if (!ok && esc[parte] !== pessoa) return res.status(409).json({ erro: "verso ocupado", escolhas: esc });
      // cada convidado fica com um verso só: libera o anterior
      for (const [p, q] of Object.entries(esc)) if (q === pessoa && p !== parte) await redis(["HDEL", KEY, p]);
      esc = await todas();
      return res.status(200).json({ escolhas: esc });
    }

    if (acao === "liberar") {
      const atual = await redis(["HGET", KEY, parte]);
      if (atual === pessoa) await redis(["HDEL", KEY, parte]);
      return res.status(200).json({ escolhas: await todas() });
    }

    return res.status(400).json({ erro: "ação inválida" });
  } catch (e) {
    return res.status(503).json({ erro: String((e && e.message) || e) });
  }
};

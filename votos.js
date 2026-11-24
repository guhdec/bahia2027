// API de votos — guarda no Upstash Redis (Vercel Marketplace > Upstash Redis)
// Variáveis criadas automaticamente pela integração: KV_REST_API_URL / KV_REST_API_TOKEN
// (ou UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const HASH = 'cardapio:votos';
const MAX_VOTOS = 60;
const TAM = { C: 22, E: 27, P: 32, A: 12, S: 7 };

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).result;
}

const limpa = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) return res.status(503).json({ erro: 'Banco de votos não configurado' });

  try {
    if (req.method === 'GET') {
      const flat = (await redis(['HGETALL', HASH])) || [];
      const votos = [];
      for (let i = 0; i < flat.length; i += 2) {
        try { votos.push(JSON.parse(flat[i + 1])); } catch {}
      }
      votos.sort((a, b) => (a.em || 0) - (b.em || 0));
      return res.status(200).json({ votos });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const nome = limpa(body.nome, 30);
      if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
      const v = {};
      for (const [k, n] of Object.entries(TAM)) {
        const d = String(body.v?.[k] ?? '');
        if (!new RegExp(`^[0-3]{${n}}$`).test(d)) return res.status(400).json({ erro: 'Voto inválido' });
        v[k] = d;
      }
      const chave = nome.toLowerCase();
      const existe = await redis(['HEXISTS', HASH, chave]);
      if (!existe && (await redis(['HLEN', HASH])) >= MAX_VOTOS) {
        return res.status(429).json({ erro: 'Limite de votos atingido' });
      }
      const voto = { nome, v, obs: limpa(body.obs, 140), em: Date.now() };
      await redis(['HSET', HASH, chave, JSON.stringify(voto)]);
      return res.status(200).json({ ok: true, atualizado: !!existe });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao acessar o banco' });
  }
}

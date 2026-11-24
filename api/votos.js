// API de votos. Funciona com os dois tipos de Redis da Vercel:
//  - Upstash (REST): variáveis *_REST_API_URL / *_REST_API_TOKEN (com ou sem prefixo)
//  - Redis Cloud / qualquer Redis: variável REDIS_URL (ou KV_URL / *_REDIS_URL)
// Diagnóstico: abra /api/votos?diag=1

import { createClient } from 'redis';

const HASH = 'cardapio:votos';
const MAX_VOTOS = 60;
const TAM = { C: 22, E: 27, P: 32, A: 12, S: 7 };

const env = process.env;
const achar = (re) => Object.keys(env).find((k) => re.test(k) && env[k]);
const REST_URL_K = achar(/^UPSTASH_REDIS_REST_URL$/) || achar(/REST_API_URL$/);
const REST_TOK_K = achar(/^UPSTASH_REDIS_REST_TOKEN$/) || achar(/REST_API_TOKEN$/);
const TCP_K = achar(/^REDIS_URL$/) || achar(/^KV_URL$/) || achar(/_REDIS_URL$/) || achar(/_KV_URL$/);
const MODO = REST_URL_K && REST_TOK_K ? 'rest' : TCP_K ? 'tcp' : null;

// ---------- REST (Upstash) ----------
async function rest(cmd) {
  const r = await fetch(env[REST_URL_K], {
    method: 'POST',
    headers: { Authorization: `Bearer ${env[REST_TOK_K]}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('Upstash: ' + (j.error || r.status));
  return j.result;
}

// ---------- TCP (Redis Cloud etc.) ----------
let clientP = null;
function tcp() {
  if (!clientP) {
    const c = createClient({ url: env[TCP_K], socket: { connectTimeout: 8000 } });
    c.on('error', () => {});
    clientP = c.connect().then(() => c).catch((e) => { clientP = null; throw e; });
  }
  return clientP;
}

const db = {
  async todos() {
    if (MODO === 'rest') {
      const flat = (await rest(['HGETALL', HASH])) || [];
      const o = {};
      for (let i = 0; i < flat.length; i += 2) o[flat[i]] = flat[i + 1];
      return o;
    }
    return (await tcp()).hGetAll(HASH);
  },
  async existe(k) {
    return MODO === 'rest' ? !!(await rest(['HEXISTS', HASH, k])) : !!(await (await tcp()).hExists(HASH, k));
  },
  async total() {
    return MODO === 'rest' ? +(await rest(['HLEN', HASH])) : +(await (await tcp()).hLen(HASH));
  },
  async gravar(k, v) {
    return MODO === 'rest' ? rest(['HSET', HASH, k, v]) : (await tcp()).hSet(HASH, k, v);
  },
};

const limpa = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET' && req.query?.diag) {
    const nomes = Object.keys(env).filter((k) => /REDIS|KV_|UPSTASH/i.test(k));
    let teste = 'não testado';
    if (MODO) {
      try { await db.total(); teste = 'conexão OK'; } catch (e) { teste = 'falhou: ' + e.message; }
    }
    return res.status(200).json({
      modo: MODO || 'nenhum banco encontrado',
      variaveis_encontradas: nomes,
      usando: MODO === 'rest' ? [REST_URL_K, REST_TOK_K] : MODO === 'tcp' ? [TCP_K] : [],
      teste,
    });
  }

  if (!MODO) return res.status(503).json({ erro: 'Banco não encontrado: conecte o Redis ao projeto e faça Redeploy' });

  try {
    if (req.method === 'GET') {
      const o = (await db.todos()) || {};
      const votos = [];
      for (const v of Object.values(o)) { try { votos.push(JSON.parse(v)); } catch {} }
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
      const existe = await db.existe(chave);
      if (!existe && (await db.total()) >= MAX_VOTOS) return res.status(429).json({ erro: 'Limite de votos atingido' });
      await db.gravar(chave, JSON.stringify({ nome, v, obs: limpa(body.obs, 140), em: Date.now() }));
      return res.status(200).json({ ok: true, atualizado: existe });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha no banco: ' + e.message });
  }
}

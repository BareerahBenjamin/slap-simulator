// POST /api/hit  body: { code, spins } —— 把一巴掌计入全网汇总，返回最新 { board }
// 校验：code 必须是 16 个合法 MBTI 之一；spins 为 1~8 的整数（和前端 MAX_SPINS 对齐），挡刷分。
// 轻量防刷：同一 IP 每 10 秒最多 30 次。凭据全在 Vercel 环境变量里，前端无法接触。
import { kv } from '@vercel/kv';

const CODES = new Set(['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP',
                       'ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP']);
const ALL = [...CODES];
const KEY = 'slap:stats';

async function rateLimited(req) {
  try {
    const ip = (req.headers['x-forwarded-for'] || 'anon').split(',')[0].trim();
    const rk = 'slap:rl:' + ip;
    const n = await kv.incr(rk);
    if (n === 1) await kv.expire(rk, 10);
    return n > 30;
  } catch (e) { return false; }   // 限流失败不该阻断正常游戏
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }

  const { code, spins } = readBody(req);
  const s = Number(spins);
  if (!CODES.has(code) || !Number.isInteger(s) || s < 1 || s > 8) {
    return res.status(400).json({ error: 'bad_input' });
  }

  try {
    if (await rateLimited(req)) return res.status(429).json({ error: 'too_many' });

    // hits / spins 原子自增
    await kv.hincrby(KEY, code + ':hits', 1);
    await kv.hincrby(KEY, code + ':spins', s);
    // best 取最大值（读-比-写；并发下偶有细微误差，小游戏可接受）
    const curBest = +(await kv.hget(KEY, code + ':best')) || 0;
    if (s > curBest) await kv.hset(KEY, { [code + ':best']: s });

    // 返回整张最新汇总，前端直接替换本地副本
    const flat = (await kv.hgetall(KEY)) || {};
    const board = {};
    for (const c of ALL) {
      const hits  = +flat[c + ':hits']  || 0;
      const cSpins= +flat[c + ':spins'] || 0;
      const best  = +flat[c + ':best']  || 0;
      if (hits || cSpins || best) board[c] = { hits, spins: cSpins, best };
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ board });
  } catch (e) {
    console.error('hit error', e);
    return res.status(500).json({ error: 'kv_unavailable' });
  }
}

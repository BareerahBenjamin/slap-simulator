// GET /api/board —— 读取全网挨打汇总，返回 { board: { CODE: {hits,spins,best} } }
// 凭据（KV_REST_API_URL / KV_REST_API_TOKEN）由 Vercel 环境变量注入，浏览器永远看不到。
import { kv } from '@vercel/kv';

const CODES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP',
               'ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];
const KEY = 'slap:stats';   // 一个 hash，字段形如 INTJ:hits / INTJ:spins / INTJ:best

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  try {
    const flat = (await kv.hgetall(KEY)) || {};
    const board = {};
    for (const code of CODES) {
      const hits  = +flat[code + ':hits']  || 0;
      const spins = +flat[code + ':spins'] || 0;
      const best  = +flat[code + ':best']  || 0;
      if (hits || spins || best) board[code] = { hits, spins, best };
    }
    // 别让 CDN 缓存住，保证近实时
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ board });
  } catch (e) {
    console.error('board error', e);
    return res.status(500).json({ error: 'kv_unavailable' });
  }
}

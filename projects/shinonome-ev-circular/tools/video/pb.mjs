// 手元の PaoBub を API で動かす小さな道具（ペルソナのログイン・呼び出し）
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
const API = process.env.PB_API ?? 'http://127.0.0.1:4841';
const OUT = join(homedir(), '.paobub-mvp', 'outbox');
const jars = new Map();
const mails = () => { try { return readdirSync(OUT).sort().map((f) => ({ f, m: JSON.parse(readFileSync(join(OUT, f), 'utf8')) })); } catch { return []; } };
export async function login(email) {
  if (jars.has(email)) return jars.get(email);
  const had = new Set(mails().map((x) => x.f));
  let r = await fetch(`${API}/api/auth/code`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
  if (r.status !== 202) throw new Error(`code ${r.status} ${await r.text()}`);
  const mail = mails().filter((x) => !had.has(x.f) && x.m.to === email && x.m.kind === 'login-code').pop();
  const code = mail?.m.code ?? /\b(\d{6})\b/.exec(mail?.m.text ?? '')?.[1];
  r = await fetch(`${API}/api/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, code }) });
  if (r.status !== 200) throw new Error(`verify ${r.status} ${await r.text()}`);
  const cookie = /paobub_session=([^;]+)/.exec(r.headers.get('set-cookie'))[0];
  jars.set(email, cookie); return cookie;
}
export async function call(email, method, path, body) {
  const cookie = await login(email);
  const r = await fetch(`${API}${path}`, { method, headers: { cookie, 'content-type': 'application/json', origin: 'http://127.0.0.1:4840' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 300)}`);
  return j;
}
export const lastMail = (to, kind) => mails().filter((x) => x.m.to === to && (!kind || x.m.kind === kind)).pop()?.m;

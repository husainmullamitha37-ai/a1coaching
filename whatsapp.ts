import crypto from 'crypto';
import { db, getSettings, log } from './supabase';

const GRAPH = 'https://graph.facebook.com/v21.0';
export const waConfigured = (s: any) => !!(process.env.WA_ACCESS_TOKEN && (s.wa_phone_number_id || process.env.WA_PHONE_NUMBER_ID) && s.template_name);

// Indian numbers -> "91XXXXXXXXXX", otherwise null
export function normalizeIndianPhone(input: string): string | null {
  let d = (input || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  return /^91[6-9]\d{9}$/.test(d) ? d : null;
}
export const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('-');

export function verifySignature(raw: string, header: string | null) {
  if (!header || !process.env.WA_APP_SECRET) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', process.env.WA_APP_SECRET).update(raw).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Template body variables: {{1}} student, {{2}} date, {{3}} institute, {{4}} teacher
async function sendTemplate(to: string, s: any, vars: string[], messageId: string) {
  const components: any[] = [{ type: 'body', parameters: vars.map(text => ({ type: 'text', text })) }];
  if (s.template_has_buttons) ['1', '2'].forEach((n, i) => components.push({ type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload: `${n}|${messageId}` }] }));
  try {
    const r = await fetch(`${GRAPH}/${s.wa_phone_number_id || process.env.WA_PHONE_NUMBER_ID}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: { name: s.template_name, language: { code: s.template_lang || 'en' }, components } }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (r.ok && j.messages?.[0]?.id) return { ok: true as const, id: j.messages[0].id as string };
    const temporary = r.status >= 500 || r.status === 429 || [130429, 131016, 131056, 2, 4, 80007].includes(j.error?.code);
    return { ok: false as const, temporary, error: `${j.error?.code ?? r.status}: ${j.error?.message ?? 'Request failed'}` };
  } catch (e: any) { return { ok: false as const, temporary: true, error: `Network error: ${e.message}` }; }
}

// Claims a queued message, sends it, and only marks it "sent" after the API accepts it.
export async function dispatch(id: string) {
  const s = await getSettings();
  if (!s.auto_notifications || !waConfigured(s)) return { skipped: true };
  const claim = await db.from('whatsapp_messages').update({ status: 'sending' }).eq('id', id).eq('status', 'queued').select('*, students(name), attendance(att_date)');
  const m: any = claim.data?.[0]; if (!m) return { skipped: true };
  const res = await sendTemplate(m.to_phone, s, [m.students.name, ddmmyyyy(m.attendance.att_date), s.institute_name, s.teacher_name], id);
  if (res.ok) {
    await db.from('whatsapp_messages').update({ status: 'sent', wa_message_id: res.id, sent_at: new Date().toISOString(), error: null }).eq('id', id).eq('status', 'sending');
    await db.from('attendance').update({ parent_status: 'awaiting' }).eq('id', m.attendance_id).eq('parent_status', 'none');
    await log(id, 'api_accepted', { wa_message_id: res.id });
    return { sent: true };
  }
  const n = m.retry_count + 1;
  if (res.temporary && n <= s.max_retries) {
    await db.from('whatsapp_messages').update({ status: 'queued', retry_count: n, error: res.error, next_retry_at: new Date(Date.now() + 2 ** n * 60_000).toISOString() }).eq('id', id);
    await log(id, 'retry_scheduled', { n, error: res.error });
  } else {
    await db.from('whatsapp_messages').update({ status: 'failed', error: res.error, failed_at: new Date().toISOString() }).eq('id', id);
    await db.from('attendance').update({ parent_status: 'failed' }).eq('id', m.attendance_id);
    await log(id, 'failed', { error: res.error });
  }
  return { failed: !res.temporary };
}

import { NextResponse } from 'next/server';
import { db, log, adminId } from '@/lib/supabase';
import { verifySignature } from '@/lib/whatsapp';

const RANK: Record<string, number> = { queued: 0, sending: 1, sent: 2, delivered: 3, read: 4, replied: 5 };

// Meta calls this once to verify the webhook URL
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === process.env.WA_VERIFY_TOKEN
    ? new Response(p.get('hub.challenge')) : new Response('Forbidden', { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'))) return new Response('Bad signature', { status: 401 });
  const body = JSON.parse(raw); let retry = false;
  for (const e of body.entry ?? []) for (const c of e.changes ?? []) {
    for (const st of c.value?.statuses ?? []) retry = (await onStatus(st)) || retry;
    for (const m of c.value?.messages ?? []) await onReply(m);
  }
  return retry ? new Response('Retry', { status: 500 }) : NextResponse.json({ ok: true }); // 500 makes Meta redeliver
}

async function onStatus(st: any) {
  const { data: m } = await db.from('whatsapp_messages').select('id,status,attendance_id').eq('wa_message_id', st.id).maybeSingle();
  if (!m) return true; // our own "sent" update may not be saved yet: ask Meta to retry
  const at = new Date(Number(st.timestamp) * 1000).toISOString();
  if (st.status === 'failed') {
    const err = st.errors?.[0] ? `${st.errors[0].code}: ${st.errors[0].title}` : 'Delivery failed';
    await db.from('whatsapp_messages').update({ status: 'failed', failed_at: at, error: err }).eq('id', m.id);
    await db.from('attendance').update({ parent_status: 'failed' }).eq('id', m.attendance_id);
  } else if (RANK[st.status] !== undefined && RANK[st.status] > RANK[m.status]) {
    const col = ({ sent: 'sent_at', delivered: 'delivered_at', read: 'read_at' } as Record<string, string>)[st.status];
    await db.from('whatsapp_messages').update({ status: st.status, ...(col ? { [col]: at } : {}) }).eq('id', m.id);
  }
  await log(m.id, `status_${st.status}`, st);
  return false;
}

async function onReply(msg: any) {
  const payload: string = msg.button?.payload ?? msg.interactive?.button_reply?.id ?? '';
  const text: string = (msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? '').trim();
  const [choice, msgId] = payload.includes('|') ? payload.split('|') : [text, null];
  const kind = choice === '1' ? 'confirmed' : choice === '2' ? 'disputed' : 'other';

  // Exact message when a button payload carries its id; otherwise the parent's most recent notice
  let q = db.from('whatsapp_messages').select('id,student_id,attendance_id,status').eq('to_phone', msg.from);
  q = msgId ? q.eq('id', msgId) : q.order('queued_at', { ascending: false }).limit(1);
  const { data: m } = await q.maybeSingle();

  const ins = await db.from('parent_replies').upsert({ message_id: m?.id ?? null, student_id: m?.student_id ?? null, wa_message_id: msg.id, from_phone: msg.from, body: text || null, payload: payload || null, kind, received_at: new Date(Number(msg.timestamp) * 1000).toISOString() }, { onConflict: 'wa_message_id', ignoreDuplicates: true }).select('id');
  if (!ins.data?.length || !m) return; // duplicate delivery, or a message we cannot match to a notice
  await db.from('whatsapp_messages').update({ status: 'replied' }).eq('id', m.id).neq('status', 'failed');
  await db.from('follow_up_tasks').update({ status: 'cancelled' }).eq('message_id', m.id).eq('kind', 'no_response').in('status', ['pending', 'in_progress']);

  const assigned_to = await adminId();
  if (kind === 'confirmed') await db.from('attendance').update({ parent_status: 'confirmed' }).eq('id', m.attendance_id);
  else if (kind === 'disputed') {
    await db.from('attendance').update({ parent_status: 'disputed' }).eq('id', m.attendance_id);
    await db.from('follow_up_tasks').upsert({ message_id: m.id, attendance_id: m.attendance_id, student_id: m.student_id, kind: 'disputed', priority: 'high', reason: 'Parent says the student was present. Verify attendance.', assigned_to }, { onConflict: 'message_id,kind', ignoreDuplicates: true });
  } else {
    await db.from('attendance').update({ parent_status: 'needs_review' }).eq('id', m.attendance_id).in('parent_status', ['none', 'awaiting']);
    await db.from('follow_up_tasks').upsert({ message_id: m.id, attendance_id: m.attendance_id, student_id: m.student_id, kind: 'needs_review', priority: 'medium', reason: 'Parent sent a message that needs review.', assigned_to }, { onConflict: 'message_id,kind', ignoreDuplicates: true });
  }
  await log(m.id, `reply_${kind}`, { body: text });
}

'use client';
import { useEffect, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { sb, today, dmy, tm, normalizeIndianPhone } from '@/lib/client';
import { Reminder, Alerts, History, Reports, WhatsApp, Settings } from '@/components/More';

const one = (x: any) => (Array.isArray(x) ? x[0] : x);
const PS: Record<string, [string, string]> = { none: ['Not sent', 't-grey'], awaiting: ['Awaiting response', 't-orange'], confirmed: ['Confirmed absent', 't-green'], disputed: ['Disputed', 't-red'], needs_review: ['Needs review', 't-orange'], under_verification: ['Under verification', 't-blue'], failed: ['Notification failed', 't-grey'] };
const Tag = ({ s }: { s: string }) => <span className={`tag ${PS[s]?.[1] ?? 't-grey'}`}>{PS[s]?.[0] ?? s}</span>;

export default function App() {
  const [session, setSession] = useState<any>(null), [ready, setReady] = useState(false), [view, setView] = useState('dash');
  useEffect(() => { sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); }); const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s)); return () => data.subscription.unsubscribe(); }, []);
  if (!ready) return null;
  if (!session) return <Login />;
  const nav = [['dash', 'Dashboard'], ['students', 'Students & Batches'], ['mark', 'Mark Attendance'], ['hist', 'Attendance History'], ['resp', 'Parent Responses'], ['wa', 'WhatsApp Notifications'], ['tasks', 'Calling Tasks'], ['reports', 'Reports'], ['settings', 'Settings']];
  return (<div className="shell"><aside className="side"><div className="logo"><i>A1</i>A1 Coaching Classes</div>
    {nav.map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}
    <button onClick={() => sb.auth.signOut()}>Log out</button></aside>
    <main className="main"><Alerts />{({ dash: <Dash />, students: <Students />, mark: <Mark token={session.access_token} />, hist: <History />, resp: <Resp />, wa: <WhatsApp token={session.access_token} />, tasks: <Tasks />, reports: <Reports />, settings: <Settings /> } as any)[view]}</main></div>);
}

function Login() {
  const [em, setEm] = useState(''), [pw, setPw] = useState(''), [msg, setMsg] = useState(''), [forgot, setForgot] = useState(false);
  const go = async () => { setMsg(''); if (forgot) { const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin }); setMsg(error ? error.message : 'Check your email for the reset link.'); } else { const { error } = await sb.auth.signInWithPassword({ email: em, password: pw }); if (error) setMsg('Email or password is incorrect.'); } };
  return (<div className="login"><div className="logo" style={{ color: '#0b1f4d', justifyContent: 'center' }}><i>A1</i>A1 Coaching Classes</div>
    <div className="card"><h2>{forgot ? 'Reset password' : 'Welcome, Lokesh Sir'}</h2>
      <input type="email" placeholder="Email" value={em} onChange={e => setEm(e.target.value)} />
      {!forgot && <input type="password" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />}
      <div className="err">{msg}</div><button className="btn pri" style={{ width: '100%' }} onClick={go}>{forgot ? 'Send reset link' : 'Log in'}</button>
      <p style={{ textAlign: 'center' }}><button className="btn sm" onClick={() => setForgot(!forgot)}>{forgot ? 'Back to log in' : 'Forgot password?'}</button></p></div></div>);
}

// Reloads whenever the given tables change (Supabase realtime)
function useLive(tables: string[], load: () => void) {
  useEffect(() => { load(); const ch = sb.channel('live-' + tables.join('-') + Math.random()); tables.forEach(t => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => load())); ch.subscribe(); return () => { sb.removeChannel(ch); }; }, []); // eslint-disable-line
}

function Dash() {
  const [d, setD] = useState(today()), [s, setS] = useState<any>({}), [act, setAct] = useState<any[]>([]);
  const load = useCallback(async () => {
    const [st, ba, at, tk, lg] = await Promise.all([sb.from('students').select('id', { count: 'exact', head: true }).eq('status', 'active'), sb.from('batches').select('id', { count: 'exact', head: true }),
      sb.from('attendance').select('status,parent_status').eq('att_date', d), sb.from('follow_up_tasks').select('status'), sb.from('notification_logs').select('event,created_at,whatsapp_messages(students(name))').order('created_at', { ascending: false }).limit(12)]);
    const a = at.data ?? [], c = (f: (x: any) => boolean) => a.filter(f).length, present = c(x => x.status === 'present'), absent = c(x => x.status === 'absent'), t = tk.data ?? [];
    setS({ students: st.count, batches: ba.count, present, absent, pct: present + absent ? Math.round(present / (present + absent) * 100) : 0, confirmed: c(x => x.parent_status === 'confirmed'), pending: c(x => x.parent_status === 'awaiting'), disputed: c(x => x.parent_status === 'disputed'), open: t.filter(x => ['pending', 'in_progress', 'escalated'].includes(x.status)).length, done: t.filter(x => x.status === 'completed').length });
    setAct(lg.data ?? []);
  }, [d]);
  useLive(['attendance', 'whatsapp_messages', 'parent_replies', 'follow_up_tasks'], load);
  const cards: [string, any][] = [['Total students', s.students], ['Total batches', s.batches], ['Present', s.present], ['Absent', s.absent], ['Attendance', (s.pct ?? 0) + '%'], ['Parent confirmed', s.confirmed], ['Pending responses', s.pending], ['Disputed', s.disputed], ['Pending calls', s.open], ['Completed calls', s.done]];
  const label: Record<string, string> = { api_accepted: 'WhatsApp notice sent', status_delivered: 'Notice delivered', status_read: 'Parent read the notice', reply_confirmed: 'Parent confirmed absence', reply_disputed: 'Parent disputed attendance', reply_other: 'Parent sent a message', task_no_response: 'Call task created', task_send_failed: 'Call task created (notice failed)', failed: 'Notice failed', retry_scheduled: 'Notice will retry' };
  return (<><Reminder /><div className="top"><h1>Dashboard</h1><input type="date" value={d} onChange={e => setD(e.target.value)} /></div>
    <div className="grid">{cards.map(([l, v]) => <div className="card stat" key={l} style={{ margin: 0 }}><b>{v ?? 0}</b><span>{l}</span></div>)}</div>
    <div className="card"><h2>Recent activity</h2>{act.map((x, i) => <div className="row" key={i}><div className="w">{label[x.event] ?? x.event}<small>{one(one(x.whatsapp_messages)?.students)?.name}</small></div><span className="mute">{tm(x.created_at)}</span></div>)}{!act.length && <div className="mute">Nothing yet. Activity appears after attendance is submitted.</div>}</div></>);
}

function Students() {
  const E = { name: '', roll: '', cls: '', batch: '', parent: '', wa: '', alt: '', mobile: '', adm: today(), status: 'active' };
  const [batches, setB] = useState<any[]>([]), [list, setL] = useState<any[]>([]), [nb, setNb] = useState(''), [err, setErr] = useState(''), [q, setQ] = useState(''), [bf, setBf] = useState(''), [edit, setEdit] = useState<string | null>(null), [f, setF] = useState<any>(E);
  const load = async () => { const [b, s] = await Promise.all([sb.from('batches').select('*').order('name'), sb.from('students').select('*,batches(name),parent_contacts(parent_name,whatsapp_e164,alt_phone)').order('name')]); setB(b.data ?? []); setL(s.data ?? []); };
  useEffect(() => { load(); }, []);
  const addBatch = async () => { if (!nb.trim()) return; const { error } = await sb.from('batches').insert({ name: nb.trim() }); setErr(error?.message ?? ''); setNb(''); load(); };
  const renBatch = async (b: any) => { const n = prompt('New batch name:', b.name); if (n?.trim()) { const { error } = await sb.from('batches').update({ name: n.trim() }).eq('id', b.id); setErr(error?.message ?? ''); load(); } };
  const delBatch = async (b: any) => { if (!confirm(`Delete batch ${b.name}?`)) return; const { error } = await sb.from('batches').delete().eq('id', b.id); setErr(error ? 'Move or delete the students in this batch first.' : ''); load(); };
  const save = async () => {
    const ph = normalizeIndianPhone(f.wa), alt = f.alt ? normalizeIndianPhone(f.alt) : null, mob = f.mobile ? normalizeIndianPhone(f.mobile) : null;
    if (!f.name || !f.roll || !f.cls || !f.batch || !f.parent) return setErr('Fill in name, roll, class, batch and parent name.');
    if (!ph) return setErr('Enter a valid Indian WhatsApp number (10 digits, or with +91).'); if (f.alt && !alt) return setErr('Alternative number is not valid.'); if (f.mobile && !mob) return setErr('Student mobile is not valid.');
    const row = { name: f.name.trim(), roll_no: +f.roll, class_name: f.cls, batch_id: f.batch, mobile: mob, admission_date: f.adm || today(), status: f.status };
    const r = edit ? await sb.from('students').update(row).eq('id', edit).select('id').single() : await sb.from('students').insert(row).select('id').single();
    if (r.error) return setErr(r.error.message.includes('unique') ? 'That roll number is already used in this batch.' : r.error.message);
    const c = await sb.from('parent_contacts').upsert({ student_id: r.data.id, parent_name: f.parent.trim(), whatsapp_e164: ph, alt_phone: alt }, { onConflict: 'student_id' });
    setErr(c.error?.message ?? ''); setEdit(null); setF({ ...E, batch: f.batch }); load();
  };
  const startEdit = (s: any) => { const p = one(s.parent_contacts); setEdit(s.id); setF({ name: s.name, roll: s.roll_no, cls: s.class_name, batch: s.batch_id, parent: p?.parent_name ?? '', wa: p?.whatsapp_e164 ?? '', alt: p?.alt_phone ?? '', mobile: s.mobile ?? '', adm: s.admission_date ?? today(), status: s.status }); window.scrollTo(0, 0); };
  const del = async (s: any) => { if (confirm(`Delete ${s.name} and all their records?`)) { await sb.from('students').delete().eq('id', s.id); load(); } };
  const imp = async (e: any) => {
    const file = e.target.files[0]; if (!file) return; const wb = XLSX.read(await file.arrayBuffer()), rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }); let ok = 0; const bad: string[] = [], bm: Record<string, string> = Object.fromEntries(batches.map(b => [b.name.toLowerCase(), b.id]));
    for (const [i, o] of rows.entries()) {
      const k: any = {}; for (const a in o) k[a.toLowerCase().replace(/[^a-z]/g, '')] = String(o[a]).trim();
      const name = k.name || k.studentname, ph = normalizeIndianPhone(k.parentwhatsapp || k.whatsapp || k.phone || ''), bn = k.batch || '';
      if (!name || !ph || !bn || !(k.roll || k.rollno || k.rollnumber)) { bad.push(`Row ${i + 2}: needs name, roll, batch and a valid parent WhatsApp`); continue; }
      if (!bm[bn.toLowerCase()]) { const { data } = await sb.from('batches').insert({ name: bn }).select('id').single(); if (data) bm[bn.toLowerCase()] = data.id; }
      const s = await sb.from('students').insert({ name, roll_no: +(k.roll || k.rollno || k.rollnumber), class_name: k.class || k.standard || '', batch_id: bm[bn.toLowerCase()] }).select('id').single();
      if (s.error) { bad.push(`Row ${i + 2}: ${s.error.message.includes('unique') ? 'roll number already used' : s.error.message}`); continue; }
      await sb.from('parent_contacts').insert({ student_id: s.data.id, parent_name: k.parent || k.parentname || 'Parent', whatsapp_e164: ph }); ok++;
    }
    e.target.value = ''; setErr(`Imported ${ok} students.${bad.length ? ' Skipped: ' + bad.slice(0, 5).join('; ') : ''}`); load();
  };
  const shown = list.filter(s => (s.name + s.student_code).toLowerCase().includes(q.toLowerCase()) && (!bf || s.batch_id === bf));
  const inp = (k: string, ph: string, t = 'text', w?: number) => <input placeholder={ph} type={t} style={w ? { width: w } : {}} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} />;
  return (<><h1 style={{ marginBottom: 14 }}>Students & Batches</h1><div className="err">{err}</div>
    <div className="card"><h2>Batches</h2>{batches.map(b => <div className="row" key={b.id}><div className="w">{b.name}<small>{list.filter(s => s.batch_id === b.id).length} students</small></div><button className="btn sm" onClick={() => renBatch(b)}>Rename</button><button className="btn sm" onClick={() => delBatch(b)}>Delete</button></div>)}<div className="bar" style={{ marginTop: 10 }}><input placeholder="New batch name" value={nb} onChange={e => setNb(e.target.value)} /><button className="btn" onClick={addBatch}>Add batch</button></div></div>
    <div className="card"><h2>{edit ? 'Edit student' : 'Add student'}</h2><div className="bar">{inp('name', 'Student name')}{inp('roll', 'Roll no.', 'number', 90)}{inp('cls', 'Class', 'text', 80)}<select value={f.batch} onChange={e => setF({ ...f, batch: e.target.value })}><option value="">Batch</option>{batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>{inp('mobile', 'Student mobile (optional)')}</div>
      <div className="bar">{inp('parent', 'Parent name')}{inp('wa', 'Parent WhatsApp')}{inp('alt', 'Alternative parent number')}<input type="date" value={f.adm} onChange={e => setF({ ...f, adm: e.target.value })} /><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      <button className="btn pri" onClick={save}>{edit ? 'Save changes' : 'Add student'}</button> {edit && <button className="btn" onClick={() => { setEdit(null); setF(E); }}>Cancel</button>}
      <p className="mute" style={{ fontSize: 13 }}>Student ID is created automatically. Import: choose an Excel or CSV file with columns Name, Roll, Class, Batch, Parent, Parent WhatsApp. <label className="btn sm" style={{ marginLeft: 6 }}>Import file<input type="file" accept=".csv,.xlsx,.xls" hidden onChange={imp} /></label></p></div>
    <div className="card"><div className="bar"><h2 style={{ margin: 0 }}>Students ({shown.length})</h2><input placeholder="Search name or ID" value={q} onChange={e => setQ(e.target.value)} /><select value={bf} onChange={e => setBf(e.target.value)}><option value="">All batches</option>{batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      {shown.map(s => { const p = one(s.parent_contacts); return <div className="row" key={s.id} style={{ opacity: s.status === 'inactive' ? .55 : 1 }}><div className="w">{s.name}<small>{s.student_code} · Roll {s.roll_no} · Class {s.class_name} · {s.batches?.name}{s.status === 'inactive' ? ' · Inactive' : ''}</small></div><div className="w">{p?.parent_name}<small>+{p?.whatsapp_e164}{p?.alt_phone ? ` · alt +${p.alt_phone}` : ''}</small></div><button className="btn sm" onClick={() => startEdit(s)}>Edit</button><button className="btn sm" onClick={() => del(s)}>Delete</button></div>; })}
      {!shown.length && <div className="mute">No students yet. Create a batch, then add students.</div>}</div></>);
}

function Mark({ token }: { token: string }) {
  const [batches, setB] = useState<any[]>([]), [batch, setBatch] = useState(''), [list, setL] = useState<any[]>([]), [m, setM] = useState<Record<string, string>>({}), [q, setQ] = useState(''), [d, setD] = useState(today()), [res, setRes] = useState<any>(null), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  useEffect(() => { sb.from('batches').select('*').order('name').then(({ data }) => { setB(data ?? []); if (data?.length) setBatch(data[0].id); }); }, []);
  useEffect(() => { if (!batch) return; (async () => { const [s, a, sub] = await Promise.all([sb.from('students').select('id,name,roll_no').eq('batch_id', batch).eq('status', 'active').order('roll_no'), sb.from('attendance').select('student_id,status').eq('batch_id', batch).eq('att_date', d), sb.from('attendance_submissions').select('id').eq('batch_id', batch).eq('att_date', d)]); setL(s.data ?? []); setM(Object.fromEntries((a.data ?? []).map(x => [x.student_id, x.status]))); setDone(!!sub.data?.length); setRes(null); })(); }, [batch, d]);
  const set = (id: string, v: string) => setM(p => { const n = { ...p }; if (n[id] === v) delete n[id]; else n[id] = v; return n; });
  const pres = list.filter(s => m[s.id] === 'present').length, abs = list.filter(s => m[s.id] === 'absent').length, pend = list.length - pres - abs;
  const submit = async () => {
    if (pend && !confirm(`${pend} students are not marked. Mark them first, or they will be left out. Continue?`)) return;
    if (!confirm(`Submit attendance?\n\nPresent: ${pres}\nAbsent: ${abs}\n\nWhatsApp notices go to the parents of absent students right away.`)) return;
    setBusy(true); const r = await fetch('/api/attendance/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ batchId: batch, date: d, records: list.filter(s => m[s.id]).map(s => ({ studentId: s.id, status: m[s.id] })) }) });
    setRes(await r.json()); setBusy(false); setDone(r.ok);
  };
  const shown = list.filter(s => s.name.toLowerCase().includes(q.toLowerCase()));
  return (<><h1 style={{ marginBottom: 14 }}>Mark Attendance</h1>
    <div className="bar"><input type="date" value={d} onChange={e => setD(e.target.value)} /><select value={batch} onChange={e => setBatch(e.target.value)}>{batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><input placeholder="Search student" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="grid"><div className="card stat" style={{ margin: 0 }}><b>{list.length}</b><span>Total</span></div><div className="card stat" style={{ margin: 0 }}><b style={{ color: 'var(--ok)' }}>{pres}</b><span>Present</span></div><div className="card stat" style={{ margin: 0 }}><b style={{ color: 'var(--bad)' }}>{abs}</b><span>Absent</span></div><div className="card stat" style={{ margin: 0 }}><b style={{ color: 'var(--grey)' }}>{pend}</b><span>Pending</span></div></div>
    {res?.error && <div className="err">{res.error}</div>}{res?.warning && <div className="warn">{res.warning}</div>}
    {res && !res.error && <div className="card">Saved {res.saved} records. {res.newNotices} new WhatsApp notices queued for {res.absent} absent students.{res.noContact ? ` ${res.noContact} absent students have no parent contact saved.` : ''}</div>}
    <div className="card"><div className="bar"><button className="btn" onClick={() => setM(Object.fromEntries(list.map(s => [s.id, 'present'])))}>Mark all present</button>{done && <span className="mute">Already submitted. Changes are saved as an edit.</span>}</div>
      {shown.map(s => <div className="row" key={s.id}><div className="w">{s.name}<small>Roll {String(s.roll_no).padStart(2, '0')}</small></div><div className="pa"><button className={'p ' + (m[s.id] === 'present' ? 'on' : '')} onClick={() => set(s.id, 'present')}>Present</button><button className={'a ' + (m[s.id] === 'absent' ? 'on' : '')} onClick={() => set(s.id, 'absent')}>Absent</button></div></div>)}
      {!list.length && <div className="mute">No students in this batch.</div>}</div>
    <button className="btn gold" disabled={busy || !list.length} onClick={submit}>{busy ? 'Submitting…' : done ? 'Save changes' : 'Submit attendance'}</button></>);
}

function Resp() {
  const [rows, setR] = useState<any[]>([]), [f, setF] = useState('all');
  const load = async () => { const { data } = await sb.from('whatsapp_messages').select('*,students(name,roll_no,parent_contacts(parent_name)),attendance(att_date,parent_status),parent_replies(body,received_at)').order('queued_at', { ascending: false }).limit(100); setR(data ?? []); };
  useLive(['whatsapp_messages', 'parent_replies', 'attendance'], load);
  const shown = rows.filter(r => f === 'all' || one(r.attendance)?.parent_status === f);
  return (<><div className="top"><h1>Parent Responses</h1><select value={f} onChange={e => setF(e.target.value)}><option value="all">All</option>{Object.entries(PS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select></div>
    {shown.map(r => { const a = one(r.attendance), s = one(r.students), rep = (r.parent_replies ?? []).slice(-1)[0]; return <div className="card" key={r.id}><div className="row" style={{ border: 0, padding: 0 }}><div className="w"><b>{s?.name}</b> <span className="mute">Roll {s?.roll_no}</span><small>{one(s?.parent_contacts)?.parent_name} · +{r.to_phone} · {a && dmy(a.att_date)}</small></div><Tag s={a?.parent_status ?? 'none'} /></div>
      <small className="mute">Message: {r.status}{r.error ? ` (${r.error})` : ''} · Sent {tm(r.sent_at)} · Delivered {tm(r.delivered_at)} · Read {tm(r.read_at)}</small>{rep && <div style={{ marginTop: 6 }}>Reply: “{rep.body}” <span className="mute">{tm(rep.received_at)}</span></div>}</div>; })}
    {!shown.length && <div className="card mute">No notices yet.</div>}</>);
}

function Tasks() {
  const [rows, setR] = useState<any[]>([]), [f, setF] = useState('open');
  const load = async () => { const { data } = await sb.from('follow_up_tasks').select('*,students(name,roll_no,batches(name),parent_contacts(parent_name,whatsapp_e164)),attendance(att_date),whatsapp_messages(status)').order('created_at', { ascending: false }).limit(200); setR(data ?? []); };
  useLive(['follow_up_tasks'], load);
  const upd = async (t: any, patch: any) => { await sb.from('follow_up_tasks').update(patch).eq('id', t.id); };
  const note = (t: any) => { const n = prompt('Result of the call:', t.notes ?? ''); if (n !== null) upd(t, { notes: n }); };
  const complete = (t: any) => { const n = prompt('Result of the call (optional):', t.notes ?? ''); if (n !== null) upd(t, { status: 'completed', notes: n, completed_at: new Date().toISOString() }); };
  const shown = rows.filter(t => f === 'all' ? true : f === 'open' ? ['pending', 'in_progress', 'escalated'].includes(t.status) : t.status === f);
  return (<><div className="top"><h1>Parent Follow-up Tasks</h1><select value={f} onChange={e => setF(e.target.value)}><option value="open">Open</option><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="escalated">Escalated</option><option value="completed">Completed</option><option value="all">All</option></select></div>
    {shown.map(t => { const s = one(t.students), p = one(s?.parent_contacts), od = t.status !== 'completed' && t.due_at && Date.now() - new Date(t.due_at).getTime() > 3600e3; return <div className="card" key={t.id} style={{ borderLeft: `4px solid ${t.priority === 'high' ? 'var(--bad)' : 'var(--warn)'}` }}>
      <div className="row" style={{ border: 0, padding: 0 }}><div className="w"><b>{s?.name}</b> <span className="mute">Roll {s?.roll_no} · {s?.batches?.name}</span><small>{p?.parent_name} · +{p?.whatsapp_e164} · Absent {dmy(one(t.attendance)?.att_date ?? '')}</small></div><span className={`tag ${t.priority === 'high' ? 't-red' : 't-orange'}`}>{t.priority} priority</span><span className={`tag ${t.status === 'completed' ? 't-green' : od ? 't-red' : 't-blue'}`}>{od ? 'overdue' : t.status.replace('_', ' ')}</span></div>
      <p style={{ margin: '8px 0 4px' }}>{t.reason}</p><small className="mute">WhatsApp: {one(t.whatsapp_messages)?.status} · Created {tm(t.created_at)}</small>{t.notes && <p style={{ margin: '6px 0' }}>Notes: {t.notes}</p>}
      {!['completed', 'cancelled'].includes(t.status) && <div className="bar" style={{ marginTop: 8 }}><a className="btn sm pri" href={`tel:+${p?.whatsapp_e164}`} onClick={() => t.status === 'pending' && upd(t, { status: 'in_progress' })}>Call parent</a><a className="btn sm" target="_blank" rel="noopener" href={`https://wa.me/${p?.whatsapp_e164}`}>Open WhatsApp</a><button className="btn sm" onClick={() => note(t)}>Add notes</button><button className="btn sm" onClick={() => upd(t, { status: 'escalated' })}>Escalate</button><button className="btn sm gold" onClick={() => complete(t)}>Mark completed</button></div>}</div>; })}
    {!shown.length && <div className="card mute">No tasks here.</div>}</>);
}

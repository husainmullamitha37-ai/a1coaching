'use client';
import { useEffect, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sb, today, dmy, tm } from '@/lib/client';

const one = (x: any) => (Array.isArray(x) ? x[0] : x);
const PS: Record<string, [string, string]> = { none: ['Not sent', 't-grey'], awaiting: ['Awaiting response', 't-orange'], confirmed: ['Confirmed absent', 't-green'], disputed: ['Disputed', 't-red'], needs_review: ['Needs review', 't-orange'], under_verification: ['Under verification', 't-blue'], failed: ['Notification failed', 't-grey'] };
const lbl = (s: string) => PS[s]?.[0] ?? s;
const Tag = ({ s }: { s: string }) => <span className={`tag ${PS[s]?.[1] ?? 't-grey'}`}>{lbl(s)}</span>;
const addDays = (iso: string, n: number) => { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const range = (mode: string, d: string): [string, string] => mode === 'day' ? [d, d] : mode === 'week' ? [addDays(d, -6), d] : [d.slice(0, 8) + '01', addDays(d.slice(0, 7) + '-01', 31).slice(0, 7) === d.slice(0, 7) ? d.slice(0, 7) + '-31' : addDays(addDays(d.slice(0, 7) + '-01', 31).slice(0, 7) + '-01', -1)];
const pct = (p: number, a: number) => (p + a ? Math.round((p / (p + a)) * 100) : 0);
const live = (tables: string[], load: () => void) => { load(); const ch = sb.channel('l-' + tables.join('') + Math.random()); tables.forEach(t => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => load())); ch.subscribe(); return () => { sb.removeChannel(ch); }; };
const Stat = ({ l, v, c }: any) => <div className="card stat" style={{ margin: 0 }}><b style={{ color: c }}>{v}</b><span>{l}</span></div>;

/* Reminder banner + live event alerts */
export function Reminder() {
  const [miss, setMiss] = useState<string[]>([]);
  useEffect(() => { (async () => {
    const [s, b, sub] = await Promise.all([sb.from('institute_settings').select('reminder_time').eq('id', 1).single(), sb.from('batches').select('id,name'), sb.from('attendance_submissions').select('batch_id').eq('att_date', today())]);
    const now = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
    if (s.data?.reminder_time && now >= String(s.data.reminder_time).slice(0, 5)) setMiss((b.data ?? []).filter(x => !(sub.data ?? []).some(y => y.batch_id === x.id)).map(x => x.name));
  })(); }, []);
  return miss.length ? <div className="warn">Attendance not submitted today for: {miss.join(', ')}.</div> : null;
}
export function Alerts() {
  const [t, setT] = useState('');
  useEffect(() => {
    const on = () => localStorage.getItem('a1-notify') !== 'off'; if (on() && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    const push = (m: string) => { if (!on()) return; setT(m); setTimeout(() => setT(''), 5000); if ('Notification' in window && Notification.permission === 'granted') new Notification('A1 Coaching Classes', { body: m }); };
    const ch = sb.channel('alerts' + Math.random()).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'follow_up_tasks' }, (p: any) => push('New call task: ' + p.new.reason)).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parent_replies' }, () => push('A parent replied on WhatsApp')).subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);
  return t ? <div style={{ position: 'fixed', right: 16, bottom: 16, background: '#0b1f4d', color: '#fff', padding: '10px 16px', borderRadius: 10, zIndex: 9, maxWidth: 320 }}>{t}</div> : null;
}

/* Attendance history and student profile */
export function History() {
  const [mode, setMode] = useState('month'), [d, setD] = useState(today()), [batch, setBatch] = useState(''), [stu, setStu] = useState(''), [batches, setB] = useState<any[]>([]), [studs, setS] = useState<any[]>([]), [rows, setR] = useState<any[]>([]);
  useEffect(() => { sb.from('batches').select('id,name').order('name').then(({ data }) => setB(data ?? [])); }, []);
  useEffect(() => { let q = sb.from('students').select('id,name,roll_no').order('name'); if (batch) q = q.eq('batch_id', batch); q.then(({ data }) => setS(data ?? [])); setStu(''); }, [batch]);
  useEffect(() => { const [a, b] = range(mode, d); let q = sb.from('attendance').select('att_date,status,parent_status,student_id,students(name,roll_no),batches(name)').gte('att_date', a).lte('att_date', b).order('att_date', { ascending: false }).limit(3000); if (batch) q = q.eq('batch_id', batch); if (stu) q = q.eq('student_id', stu); q.then(({ data }) => setR(data ?? [])); }, [mode, d, batch, stu]);
  const P = rows.filter(r => r.status === 'present').length, A = rows.length - P;
  const group = (key: (r: any) => string) => Object.entries(rows.reduce((m: any, r) => { const k = key(r); (m[k] ??= { p: 0, a: 0 })[r.status === 'present' ? 'p' : 'a']++; return m; }, {})) as [string, any][];
  const sel = studs.find(s => s.id === stu);
  return (<><h1 style={{ marginBottom: 14 }}>Attendance History</h1>
    <div className="bar"><select value={mode} onChange={e => setMode(e.target.value)}><option value="day">Daily</option><option value="week">Weekly (7 days to date)</option><option value="month">Monthly</option></select><input type="date" value={d} onChange={e => setD(e.target.value)} />
      <select value={batch} onChange={e => setBatch(e.target.value)}><option value="">All batches</option>{batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <select value={stu} onChange={e => setStu(e.target.value)}><option value="">All students</option>{studs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
    <div className="grid"><Stat l={sel ? 'Total classes' : 'Records'} v={rows.length} /><Stat l="Present" v={P} c="var(--ok)" /><Stat l="Absent" v={A} c="var(--bad)" /><Stat l="Attendance" v={pct(P, A) + '%'} /></div>
    {sel && <div className="card"><h2>Student: {sel.name} (Roll {sel.roll_no})</h2>Total classes: {rows.length} · Present: {P} · Absent: {A} · Attendance: {pct(P, A)}%</div>}
    {!stu && <div className="card"><h2>{batch ? 'By student' : 'By batch'}</h2>{group(r => batch ? one(r.students)?.name : one(r.batches)?.name).map(([k, v]) => <div className="row" key={k}><div className="w">{k}</div><span className="mute">{v.p} present · {v.a} absent</span><b>{pct(v.p, v.a)}%</b></div>)}{!rows.length && <div className="mute">No attendance in this period.</div>}</div>}
    <div className="card"><h2>Records</h2>{rows.slice(0, 300).map((r, i) => <div className="row" key={i}><div className="w">{one(r.students)?.name}<small>{dmy(r.att_date)} · {one(r.batches)?.name}</small></div>{r.status === 'absent' && <Tag s={r.parent_status} />}<span className={`tag ${r.status === 'present' ? 't-green' : 't-red'}`}>{r.status}</span></div>)}</div></>);
}

/* Reports with CSV, Excel and PDF export */
export function Reports() {
  const [type, setType] = useState('daily'), [d, setD] = useState(today()), [batch, setBatch] = useState(''), [stu, setStu] = useState(''), [batches, setB] = useState<any[]>([]), [studs, setS] = useState<any[]>([]), [rep, setRep] = useState<any>(null), [err, setErr] = useState(''), [inst, setInst] = useState('A1 Coaching Classes');
  useEffect(() => { sb.from('batches').select('id,name').order('name').then(({ data }) => setB(data ?? [])); sb.from('students').select('id,name').order('name').then(({ data }) => setS(data ?? [])); sb.from('institute_settings').select('institute_name').eq('id', 1).single().then(({ data }) => data && setInst(data.institute_name)); }, []);
  const gen = async () => {
    setErr(''); setRep(null);
    if (type === 'student' && !stu) return setErr('Choose a student.'); if (type === 'batch' && !batch) return setErr('Choose a batch.');
    if (type === 'tasks') { const { data } = await sb.from('follow_up_tasks').select('priority,status,reason,created_at,students(name,roll_no,batches(name),parent_contacts(parent_name,whatsapp_e164))').in('status', ['pending', 'in_progress', 'escalated']).order('created_at'); const rows = (data ?? []).map((t: any) => { const s = one(t.students), p = one(s?.parent_contacts); return [s?.name, s?.roll_no, s?.batches?.name, p?.parent_name, '+' + p?.whatsapp_e164, t.priority, t.status, t.reason, tm(t.created_at)]; }); return setRep({ title: 'Pending Calling Task Report', cols: ['Student', 'Roll', 'Batch', 'Parent', 'Phone', 'Priority', 'Status', 'Reason', 'Created'], rows, totals: `Pending tasks: ${rows.length}` }); }
    const [a, b] = range(type === 'weekly' ? 'week' : type === 'daily' ? 'day' : 'month', d);
    let q = sb.from('attendance').select('att_date,status,parent_status,students(name,roll_no),batches(name)').gte('att_date', a).lte('att_date', b).order('att_date').limit(5000);
    if (type === 'student') q = q.eq('student_id', stu); if (type === 'batch') q = q.eq('batch_id', batch); if (type === 'parent') q = q.eq('status', 'absent');
    const { data } = await q; const L = data ?? [], P = L.filter(r => r.status === 'present').length, A = L.length - P;
    const names: any = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', student: 'Student', batch: 'Batch', parent: 'Parent Confirmation' };
    setRep({ title: `${names[type]} ${type === 'parent' ? 'Report' : 'Attendance Report'} (${dmy(a)} to ${dmy(b)})`, cols: ['Date', 'Student', 'Roll', 'Batch', 'Attendance', 'Parent confirmation'], rows: L.map((r: any) => [dmy(r.att_date), one(r.students)?.name, one(r.students)?.roll_no, one(r.batches)?.name, r.status, r.status === 'absent' ? lbl(r.parent_status) : '–']), totals: `Total present: ${P} | Total absent: ${A} | Attendance: ${pct(P, A)}%` });
  };
  const head = () => [inst, rep.title, 'Report date: ' + dmy(today())];
  const save = (blob: Blob, ext: string) => { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = `a1-${type}-report.${ext}`; a.click(); URL.revokeObjectURL(u); };
  const csv = () => save(new Blob([[...head().map(x => `"${x}"`), '', rep.cols.join(','), ...rep.rows.map((r: any[]) => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')), '', `"${rep.totals}"`].join('\n')], { type: 'text/csv' }), 'csv');
  const xl = () => { const ws = XLSX.utils.aoa_to_sheet([[inst], [rep.title], [head()[2]], [], rep.cols, ...rep.rows, [], [rep.totals]]), wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Report'); XLSX.writeFile(wb, `a1-${type}-report.xlsx`); };
  const pdf = () => { const doc = new jsPDF({ orientation: 'landscape' }); doc.setFontSize(16); doc.text(inst, 14, 14); doc.setFontSize(11); doc.text(rep.title, 14, 21); doc.text(head()[2], 14, 27); autoTable(doc, { startY: 32, head: [rep.cols], body: rep.rows.map((r: any[]) => r.map(c => String(c ?? ''))), styles: { fontSize: 8 }, headStyles: { fillColor: [11, 31, 77] } }); doc.text(rep.totals, 14, (doc as any).lastAutoTable.finalY + 8); doc.save(`a1-${type}-report.pdf`); };
  return (<><h1 style={{ marginBottom: 14 }}>Reports</h1><div className="bar">
    <select value={type} onChange={e => setType(e.target.value)}><option value="daily">Daily attendance</option><option value="weekly">Weekly attendance</option><option value="monthly">Monthly attendance</option><option value="student">Student attendance</option><option value="batch">Batch attendance</option><option value="parent">Parent confirmation</option><option value="tasks">Pending calling tasks</option></select>
    {type !== 'tasks' && <input type="date" value={d} onChange={e => setD(e.target.value)} />}
    {type === 'batch' && <select value={batch} onChange={e => setBatch(e.target.value)}><option value="">Choose batch</option>{batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
    {type === 'student' && <select value={stu} onChange={e => setStu(e.target.value)}><option value="">Choose student</option>{studs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
    <button className="btn pri" onClick={gen}>Generate</button></div><div className="err">{err}</div>
    {rep && <div className="card"><div className="bar"><h2 style={{ margin: 0 }}>{rep.title}</h2><button className="btn sm" onClick={xl}>Excel</button><button className="btn sm" onClick={pdf}>PDF</button><button className="btn sm" onClick={csv}>CSV</button></div>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}><thead><tr>{rep.cols.map((c: string) => <th key={c} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--line)' }}>{c}</th>)}</tr></thead><tbody>{rep.rows.slice(0, 200).map((r: any[], i: number) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: 6, borderBottom: '1px solid var(--line)' }}>{c ?? '–'}</td>)}</tr>)}</tbody></table></div>
      {rep.rows.length > 200 && <p className="mute">Showing 200 of {rep.rows.length} rows. Exports include all rows.</p>}{!rep.rows.length && <p className="mute">No records for this selection.</p>}<p><b>{rep.totals}</b></p></div>}</>);
}

/* WhatsApp notifications and connection status */
export function WhatsApp({ token }: { token: string }) {
  const [rows, setR] = useState<any[]>([]), [st, setSt] = useState<any>(null);
  const load = useCallback(async () => { const { data } = await sb.from('whatsapp_messages').select('*,students(name),attendance(att_date)').order('queued_at', { ascending: false }).limit(100); setR(data ?? []); }, []);
  useEffect(() => { fetch('/api/whatsapp/status', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(setSt); return live(['whatsapp_messages'], load); }, []); // eslint-disable-line
  const c = (s: string) => rows.filter(r => r.status === s).length;
  return (<><h1 style={{ marginBottom: 14 }}>WhatsApp Notifications</h1>
    {st && (st.missing?.length ? <div className="warn"><b>WhatsApp setup is incomplete.</b> Missing: {st.missing.join(', ')}. Absence notices stay queued until this is fixed.</div> : <div className="card">Connection: <span className={`tag ${st.connected ? 't-green' : 't-red'}`}>{st.connected ? 'Connected' : 'Not connected'}</span> <span className="mute">{st.detail}</span></div>)}
    <div className="card">Webhook URL: <b>{typeof location !== 'undefined' ? location.origin : ''}/api/whatsapp/webhook</b> <span className="mute">(enter this in Meta, with your verify token)</span></div>
    <div className="grid">{['queued', 'sent', 'delivered', 'read', 'replied', 'failed'].map(s => <Stat key={s} l={s} v={c(s)} />)}</div>
    {rows.map(r => <div className="card" key={r.id}><div className="row" style={{ border: 0, padding: 0 }}><div className="w"><b>{one(r.students)?.name}</b><small>+{r.to_phone} · {dmy(one(r.attendance)?.att_date ?? '')} · retries {r.retry_count}</small></div><span className={`tag ${r.status === 'failed' ? 't-red' : r.status === 'queued' || r.status === 'sending' ? 't-orange' : r.status === 'replied' ? 't-blue' : 't-green'}`}>{r.status}</span></div>
      <small className="mute">Queued {tm(r.queued_at)} · Sent {tm(r.sent_at)} · Delivered {tm(r.delivered_at)} · Read {tm(r.read_at)}</small>{r.error && <div className="err">Error: {r.error}</div>}</div>)}
    {!rows.length && <div className="card mute">No notices yet.</div>}</>);
}

/* Settings */
export function Settings() {
  const [s, setS] = useState<any>(null), [msg, setMsg] = useState(''), [n, setN] = useState(true);
  useEffect(() => { sb.from('institute_settings').select('*').eq('id', 1).single().then(({ data }) => setS(data)); setN(localStorage.getItem('a1-notify') !== 'off'); }, []);
  if (!s) return null;
  const f = (k: string, l: string, t = 'text') => <label className="mute" style={{ display: 'block' }}>{l}<input style={{ width: '100%', display: 'block' }} type={t} value={s[k] ?? ''} onChange={e => setS({ ...s, [k]: t === 'number' ? +e.target.value : e.target.value })} /></label>;
  const ck = (k: string, l: string) => <label style={{ display: 'block', margin: '6px 0' }}><input type="checkbox" checked={!!s[k]} onChange={e => setS({ ...s, [k]: e.target.checked })} /> {l}</label>;
  const save = async () => { const { id, created_at, updated_at, ...v } = s; if (v.reminder_time && v.reminder_time.length === 5) v.reminder_time += ':00'; const { error } = await sb.from('institute_settings').update(v).eq('id', 1); setMsg(error ? error.message : 'Settings saved.'); };
  const backup = async () => { const out: any = {}; for (const t of ['batches', 'students', 'parent_contacts', 'attendance', 'whatsapp_messages', 'parent_replies', 'follow_up_tasks', 'audit_logs']) out[t] = (await sb.from(t).select('*')).data; const u = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })), a = document.createElement('a'); a.href = u; a.download = `a1-backup-${today()}.json`; a.click(); URL.revokeObjectURL(u); };
  return (<><div className="top"><h1>Settings</h1><button className="btn gold" onClick={save}>Save settings</button></div>{msg && <div className="card">{msg}</div>}
    <div className="card"><h2>Institute</h2>{f('institute_name', 'Institute name')}{f('teacher_name', 'Teacher name')}{f('address', 'Address')}{f('contact', 'Contact number')}{f('logo_url', 'Logo URL')}</div>
    <div className="card"><h2>Attendance</h2>{ck('allow_editing', 'Allow editing submitted attendance (edits are audited)')}{ck('auto_notifications', 'Send WhatsApp notices automatically after attendance is submitted')}{f('reminder_time', 'Reminder: warn on the dashboard if attendance is not submitted by (HH:MM)', 'time')}</div>
    <div className="card"><h2>WhatsApp</h2>{f('wa_business_account_id', 'Business account ID')}{f('wa_phone_number_id', 'Phone number ID')}{f('template_name', 'Approved template name')}{f('template_lang', 'Template language code')}{ck('template_has_buttons', 'Template has the two quick-reply buttons (1 and 2)')}{f('read_timeout_min', 'Minutes to wait after Read before creating a call task', 'number')}{f('fallback_timeout_min', 'Fallback minutes after Delivered when not read', 'number')}{f('max_retries', 'Retries for temporary failures', 'number')}
      <p className="mute">The access token, app secret and webhook verify token are kept in server environment variables and cannot be viewed or changed here. The WhatsApp Notifications page shows their status.</p></div>
    <div className="card"><h2>General</h2><p>Time zone: Asia/Kolkata · Date format: DD-MM-YYYY</p><label><input type="checkbox" checked={n} onChange={e => { setN(e.target.checked); localStorage.setItem('a1-notify', e.target.checked ? 'on' : 'off'); }} /> Show alerts for parent replies and new call tasks</label></div>
    <div className="card"><h2>Backup</h2><p className="mute">Download all records as a file. Turn on Supabase daily backups in your project for automatic copies.</p><button className="btn" onClick={backup}>Download backup</button></div></>);
}

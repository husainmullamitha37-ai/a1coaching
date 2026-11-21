import { createClient } from '@supabase/supabase-js';
// Browser client: anon key only. Row-level security limits it to the signed-in admin.
export const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
export function normalizeIndianPhone(input: string): string | null {
  let d = (input || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  return /^91[6-9]\d{9}$/.test(d) ? d : null;
}
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const dmy = (iso: string) => iso.split('-').reverse().join('-');
export const tm = (t?: string) => (t ? new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');

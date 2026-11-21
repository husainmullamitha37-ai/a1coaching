import { createClient } from '@supabase/supabase-js';
// Server-only client (service role). Never import this in browser code.
export const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
export const getSettings = async () => (await db.from('institute_settings').select('*').eq('id', 1).single()).data!;
export const log = (message_id: string | null, event: string, detail: any = {}) => db.from('notification_logs').insert({ message_id, event, detail });
export const adminId = async () => (await db.from('users').select('id').eq('role', 'admin').limit(1).single()).data?.id ?? null;

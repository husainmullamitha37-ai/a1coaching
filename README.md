# A1 Coaching Classes: automation backend

## What is here
- `schema.sql`: all 11 tables, constraints, indexes, row-level security, realtime.
- `lib/whatsapp.ts`: Indian phone validation, template send, signature check, retry and backoff.
- `app/api/attendance/submit`: saves attendance, writes the audit log, queues and sends one notice per absent student.
- `app/api/whatsapp/webhook`: verification, status updates (sent, delivered, read, failed), reply 1, reply 2, other replies.
- `app/api/cron/process`: retries, the 15-minute read timeout, the 30-minute fallback, failed-notice tasks.

## Not built yet
React/Next.js screens (login, dashboard, students, batches, attendance, history, responses, tasks, reports, settings), student and batch forms, Excel/PDF/CSV export, and Supabase Auth pages. Next.js, Tailwind, `@supabase/supabase-js` and `@supabase/ssr` are the dependencies. The earlier A1 prototype page is a layout reference only; it is not connected to this backend.

## Setup
1. Create a Supabase project. Run `schema.sql`. Create Lokesh Sir under Authentication, then insert a matching row into `users`.
2. In Meta Business: create a WhatsApp Business account and phone number, and a permanent System User token.
3. Create a UTILITY message template with four body variables: {{1}} student, {{2}} date, {{3}} institute, {{4}} teacher, and two quick-reply buttons "Confirmed Absent" and "Student Was Present". Wait for Meta approval. Business-initiated messages cannot be sent without an approved template.
4. Put the approved template name, phone number ID and business account ID in `institute_settings`.
5. Copy `.env.example` to your host's environment variables. Never prefix the WhatsApp or service-role values with `NEXT_PUBLIC_`.
6. Webhook callback URL: `https://YOUR-DOMAIN/api/whatsapp/webhook` with your verify token. Subscribe to the `messages` field.
7. Cron needs one run per minute. Vercel Hobby only allows daily runs, so use Vercel Pro or an external pinger that sends `Authorization: Bearer CRON_SECRET`.
8. Test with a test student and your own authorized WhatsApp number before real parents.

## Behaviours to know
- A message is marked `sent` only after Meta accepts it. Without credentials or an approved template, notices stay `queued` and the API returns a warning.
- Duplicates: one notice per attendance record (`unique(attendance_id)`), and Meta redeliveries are ignored by `unique(wa_message_id)`.
- Buttons carry the message ID, so a parent with two absent children replies to the right one. Typed "1" or "2" applies to that parent's latest notice.
- Timers run on the one-minute cron, so a task appears within about a minute of the deadline.
- If a student is changed from absent to present, the sent message stays; check any open task by hand.

## Run the app
1. `npm install`, copy `.env.example` to `.env.local`, then `npm run dev`.
2. Run `schema.sql`, then `migration-2.sql` (edit the email in its last line to Lokesh Sir's login).
3. Everything in the spec is built: login, dashboard, students and batches (edit, delete, Excel/CSV import), attendance, history and profiles, responses, WhatsApp page, calling tasks, reports (Excel, PDF, CSV), settings and backup.

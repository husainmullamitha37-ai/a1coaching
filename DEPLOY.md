# Put A1 Coaching Classes online (about 30 minutes)

1. **Database:** supabase.com > New project. SQL Editor: run `schema.sql`, then `migration-2.sql`. Under Authentication > Users, add Lokesh Sir (email + password), then run the last line of `migration-2.sql` again with his email. Copy the Project URL, anon key and service-role key (Settings > API).
2. **Code:** upload this folder to a new GitHub repository.
3. **Hosting:** vercel.com > Add New Project > pick the repository. Under Environment Variables add every name in `.env.example`. Deploy. You get a website address such as a1-coaching.vercel.app. Open it on a phone and use "Add to Home Screen" to use it like an app.
4. **WhatsApp:** in Meta Business create the WhatsApp account, a permanent token, and a UTILITY template (4 body variables, 2 quick-reply buttons: "Confirmed Absent", "Student Was Present"). After approval, open Settings in the app and enter the template name and phone number ID. Webhook: `https://YOUR-SITE/api/whatsapp/webhook`, with your verify token; subscribe to `messages`.
5. **Timer:** the follow-up calls need `https://YOUR-SITE/api/cron/process` called every minute with the header `Authorization: Bearer YOUR_CRON_SECRET`. Vercel Pro does this from `vercel.json`; otherwise use a free pinger such as cron-job.org.
6. **Test** with one test student and your own WhatsApp number before real parents.

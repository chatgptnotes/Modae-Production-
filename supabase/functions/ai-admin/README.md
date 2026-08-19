# Secure AI setup

This temporary demo function accepts the Gemini key only from the local
Super Admin or Admin persona and writes an encrypted value to the private
`ai_secrets` table. The role header is not secure against a forged request;
replace it with Supabase Auth before production.

Run the SQL in `supabase-setup.sql`, then configure and deploy:

```bash
supabase functions deploy ai-admin --no-verify-jwt
supabase functions deploy ai --no-verify-jwt
```

The browser receives only `{ ok: true, configured: true }`. It never receives
the stored key and the Admin page clears the input after a successful save.

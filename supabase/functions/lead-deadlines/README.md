# Lead deadline processor

Deploy with:

```sh
supabase functions deploy lead-deadlines --no-verify-jwt
```

Schedule it daily from Supabase Cron or the hosting scheduler. The function
uses `SUPABASE_SERVICE_ROLE_KEY` and updates the `records` state slices:
`leads`, `leadArchive`, `leadDeadlines`, and `audit`.

The browser also runs the same policy on boot/focus for demo and offline use;
the scheduled function is what expires unattended leads in a hosted deployment.

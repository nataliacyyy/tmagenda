# Tangara Mitrakom Executive Agenda

This version removes Firebase. The website runs on Vercel and stores shared agenda data in a **private Vercel Blob** through Vercel Functions.

## What is included

- Admin login using an HTTP-only session cookie.
- Viewer mode without login.
- Add / edit / delete agenda.
- Realtime-style synchronization by polling the shared server data every 2.5 seconds.
- Automatic History:
  - DONE -> History
  - CANCELLED -> History
  - Any occurrence whose date has passed -> History
- Each agenda has a single fixed date (no repeat/recurrence feature).
- Agenda data survives browser refreshes and is shared across devices.

## Vercel setup

1. Create a **Private Vercel Blob** store and connect it to this project. Vercel adds `BLOB_READ_WRITE_TOKEN` to the project environment automatically for a connected store.
2. Add these Environment Variables in Vercel:
   - `ADMIN_PASSWORD` = your desired admin password
   - `SESSION_SECRET` = a long random secret, e.g. 32+ random characters
3. Deploy the project.
4. Open the deployed URL. Viewer can immediately see the agenda.
5. Click Admin and log in with `ADMIN_PASSWORD`.

## Important

Do not put ADMIN_PASSWORD or SESSION_SECRET in index.html. They must remain Vercel Environment Variables.

The browser polls `/api/agendas` every 2.5 seconds. This is intentionally used instead of Firebase; changes saved by Admin are picked up automatically by all open viewers without redeploying the site.

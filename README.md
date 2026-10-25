# Collab Markdown

Anyone with a page's link can edit it live; each page has a Markdown preview and a hard character limit. No logins or tokens.

- `index.html`, `config.js`: static frontend (GitHub Pages)
- `worker/`: Cloudflare Worker + Durable Objects (one per page; stores text, limit, version)

## Deploy
1. Backend (free Cloudflare account): `cd worker && npx wrangler deploy`. Note the `*.workers.dev` URL.
2. Put that URL in `config.js`.
3. Push this folder to a GitHub repo and enable Pages (Settings → Pages → `main` / root).
4. Open the site, set a limit, click **Create page**, share the link.

## How it works
- Page URL: `/#/p/<id>`. IDs are random, so only people with the link can find the page.
- The creator's browser keeps an admin key. **Copy admin link** gives a link that can also change the limit; normal links cannot.
- The limit is enforced in the editor and again by the server (counted in Unicode characters, max 100000).
- Edits autosave. If two people edit different parts at once, they are merged; if they hit the same spot you choose whose version to keep.
- Anyone with a link can overwrite the page. Add rate limiting before making this public.

# 17. mai DJ 🇳🇴

Next.js-app der gjester scanner en QR-kode og foreslår sanger til Spotify-køen din. Vert godkjenner forslag, blokkerer uønskede spor, og legger automatisk inn i Spotifys avspillingskø.

## Funksjoner

- 🔍 Søk i Spotify-katalogen + valg fra forhåndsdefinert spilleliste
- 🎶 Forslag krever vert-godkjenning (du er sjef)
- ❤️ Gjester kan stemme på andres forslag (sortering)
- ⏱️ Cooldown og «kun ett pending forslag per gjest»
- 🚫 Blokker spor eller artister — fjernes fra søkeresultater
- 📺 Fullskjerm QR-side til TV-en
- 🇳🇴 17. mai-tema med konfetti

## Krav

- Spotify Premium-konto
- Aktiv enhet som spiller (Spotify-app åpen på telefon eller PC)
- [Spotify Developer App](https://developer.spotify.com/dashboard) — gratis
- En lagrings-backend, **enten** [Supabase](https://supabase.com) Postgres **eller** [Upstash Redis](https://upstash.com) — begge har gratis tier
- Vercel-konto for deploy (anbefalt) — gratis

## Lokal kjøring

1. Installer:
   ```
   npm install
   ```
2. Kopier `.env.example` til `.env.local` og fyll inn verdiene.
3. Start dev:
   ```
   npm run dev
   ```
4. Åpne <http://127.0.0.1:3000/admin> (**ikke** `localhost` — Spotify godtar bare `127.0.0.1` over HTTP), logg inn med `ADMIN_PASSWORD`, klikk "Koble til Spotify".

## Spotify-oppsett

1. Lag app på <https://developer.spotify.com/dashboard>.
2. Sett "Redirect URIs" (Spotify krever HTTPS, **bortsett fra** loopback-IP `127.0.0.1`):
   - `http://127.0.0.1:3000/api/auth/callback`
   - `https://<ditt-domene>/api/auth/callback`
3. Kopier `Client ID` og `Client Secret` til `.env.local`.
4. Lag en spilleliste i Spotify (f.eks. "17. mai 2026"), kopier ID-en fra delings-URL-en (`spotify.com/playlist/<ID>`) til `NEXT_PUBLIC_PLAYLIST_ID`.

## Upstash-oppsett

1. Lag database på <https://console.upstash.com/redis>.
2. Kopier `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` til `.env.local`.

## Supabase-oppsett (alternativ til Upstash)

1. Lag prosjekt på <https://supabase.com>.
2. Åpne SQL Editor og kjør innholdet i [`supabase/schema.sql`](supabase/schema.sql).
3. Hent verdiene fra **Project Settings → API**:
   - `SUPABASE_URL` = "Project URL"
   - `SUPABASE_SERVICE_ROLE_KEY` = "service_role" key (**ikke** anon — den skal aldri eksponeres til klient)
4. Sett begge i `.env.local`. Hvis både Supabase- og Upstash-vars er satt, brukes Supabase.

## Deploy til Vercel

1. Push repo til GitHub.
2. Importer på <https://vercel.com/new>.
3. Legg inn alle env-variablene (samme som `.env.example`). Sett:
   - `SPOTIFY_REDIRECT_URI=https://<ditt-domene>/api/auth/callback`
   - `NEXT_PUBLIC_BASE_URL=https://<ditt-domene>`
4. Deploy. Gå til `/admin` → logg inn → koble til Spotify.

## Deploy med Docker (egen server)

Spotify krever HTTPS for alt utenom `127.0.0.1`, så serveren må ha et domene med TLS. Anbefalt oppsett: en reverse proxy (Caddy/Traefik/nginx) foran containeren som håndterer Let's Encrypt.

1. Pek domenet (f.eks. `dj.dittdomene.no`) til serveren via DNS A-record.
2. På serveren, klon repoet og lag `.env`:
   ```bash
   cp .env.example .env
   # Rediger .env og sett:
   #   SPOTIFY_REDIRECT_URI=https://dj.dittdomene.no/api/auth/callback
   #   NEXT_PUBLIC_BASE_URL=https://dj.dittdomene.no
   ```
3. Legg til samme redirect-URI i Spotify Dashboard.
4. Bygg og start:
   ```bash
   docker compose up -d --build
   ```
5. Sett opp reverse proxy som terminerer TLS og videresender til `localhost:3000`. Eksempel `Caddyfile`:
   ```
   dj.dittdomene.no {
     reverse_proxy localhost:3000
   }
   ```
   Caddy henter Let's Encrypt-sertifikat automatisk.
6. Åpne `https://dj.dittdomene.no/admin` → logg inn → koble til Spotify.

For oppdatering: `git pull && docker compose up -d --build`.

## Sider

- `/` — gjest-side (QR-koden peker hit)
- `/admin` — vert-dashboard
- `/qr` — fullskjerm QR-kode for TV/storskjerm

## På festen

1. Åpne Spotify og spill av en hvilken som helst sang fra spillelisten din (sikrer aktiv enhet).
2. Vis `/qr` på TV-en eller skriv ut QR-koden.
3. Hold `/admin` åpen på telefonen — godkjenn forslag etter hvert som de kommer inn.

## Tips

- Hvis Spotify pauses lenge mister API-en aktiv enhet → admin viser advarsel. Start en sang manuelt, så fungerer det igjen.
- Cooldown er 5 min per gjest (`SUGGESTION_COOLDOWN_SECONDS`). Senk for liten fest.
- Endre `ADMIN_PASSWORD` til noe ingen gjester kan gjette.

# Always-on deployment (internet 24/7)

Ten projekt musi miec backend i baze poza komputerem lokalnym.
Bez tego aplikacja web i mobile nie beda dzialac stale przez internet mobilny/Wi-Fi.

## 1) Co wdrozyc

- API (`apps/api`) jako publiczny serwis HTTPS
- PostgreSQL jako zarzadzana baza (persistent)
- Web panel (`apps/web-admin`) jako publiczny serwis HTTPS
- Mobile (`apps/mobile-worker`) z `EXPO_PUBLIC_API_URL` wskazujacym na publiczne API

## 2) Najszybsza opcja: Render Blueprint

Repo zawiera gotowy plik `render.yaml`.

### Kroki

1. Wypchnij repo do GitHub.
2. W Render wybierz: New + Blueprint.
3. Wskaz repo i wdroz `render.yaml`.
4. Po pierwszym deployu uzupelnij sekrety serwisu `urlopy-api`:
   - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
   - `MAILBOX_ADDRESS`
   - `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`
   - `ONEDRIVE_DRIVE_ID`
   - opcjonalnie `FIREBASE_SERVICE_ACCOUNT_JSON`
5. Ustaw `CORS_ORIGINS` na finalna domene panelu web.
6. Ustaw `NEXT_PUBLIC_API_URL` w `urlopy-web` na finalny adres API.

## 2a) Opcja pod istniejace konta: Google + OneDrive

Jesli masz konto Google i Microsoft, mozesz wykorzystac je bez zmiany logiki aplikacji:

- hosting API i web: Google Cloud,
- zalaczniki: OneDrive (Microsoft Graph).

Instrukcja krok po kroku:

- docs/google-cloud-onedrive-deploy.md

## 3) Konfiguracja mobile na stale API

W `apps/mobile-worker/eas.json` ustawiony jest placeholder:

- `EXPO_PUBLIC_API_URL=https://api.twojadomena.pl`

Podmien na realny adres API i zbuduj APK/AAB:

```powershell
npm --prefix apps/mobile-worker run build:apk
```

## 4) Skrypt APK (lokalny vs produkcyjny)

Skrypt `scripts/build-mobile-apk.ps1` obsluguje teraz dwa tryby:

- Produkcja/publiczny URL:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-mobile-apk.ps1 -PublicApiUrl "https://api.twojadomena.pl"
```

- Lokalny LAN (tylko do testow):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-mobile-apk.ps1 -UseLocalIp
```

## 5) Wymaganie biznesowe "zawsze dziala"

To jest spelnione tylko wtedy, gdy:

- API i DB sa stale uruchomione w chmurze,
- domena API ma HTTPS,
- mobile i web wskazuja ten sam publiczny API URL,
- nie ma zaleznosci od lokalnego komputera i tunelu.

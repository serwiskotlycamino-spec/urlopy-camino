# Google Cloud + OneDrive deployment (wykorzystaj istniejace konta)

Tak, da sie to zrobic na kontach, ktore juz masz:

- Google: hosting API i panelu + baza PostgreSQL
- Microsoft/OneDrive: zalaczniki przez Microsoft Graph

Nie trzeba przepisywac aplikacji. Wymagane sa tylko zmienne srodowiskowe i wdrozenie.

## 1. Architektura always-on

- API: Google Cloud Run (publiczny HTTPS)
- Baza: Cloud SQL for PostgreSQL (persistent)
- Web: Firebase Hosting (SSR) albo Cloud Run
- Pliki: OneDrive (Graph API)
- Mobile: EAS build z publicznym `EXPO_PUBLIC_API_URL`

## 2. Co przygotowac

1. Projekt w Google Cloud.
2. Wlaczone API: Cloud Run, Cloud SQL Admin, Artifact Registry, Secret Manager.
3. Instancja Cloud SQL PostgreSQL.
4. Rejestracja aplikacji w Microsoft Entra ID (masz konto Microsoft, wiec to zostaje po stronie Microsoft).
5. Uprawnienie Graph: `Files.ReadWrite.All` + admin consent.

## 3. Wdrozen ie API (NestJS) do Cloud Run

Minimalny Dockerfile dla API (jesli jeszcze nie ma):

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
RUN npm ci
COPY . .
RUN npm --workspace apps/api run build
EXPOSE 8080
ENV PORT=8080
CMD ["npm", "--workspace", "apps/api", "run", "start"]
```

Build i deploy:

```powershell
gcloud auth login
gcloud config set project TWOJ_PROJECT_ID
gcloud builds submit --tag europe-central2-docker.pkg.dev/TWOJ_PROJECT_ID/urlopy/urlopy-api
gcloud run deploy urlopy-api `
  --image europe-central2-docker.pkg.dev/TWOJ_PROJECT_ID/urlopy/urlopy-api `
  --region europe-central2 `
  --allow-unauthenticated
```

Po deployu dostaniesz URL typu:

- `https://urlopy-api-xxxxx-uc.a.run.app`

## 4. Cloud SQL (PostgreSQL)

Utworz instancje i baze:

```powershell
gcloud sql instances create urlopy-pg --database-version=POSTGRES_16 --tier=db-custom-1-3840 --region=europe-central2
gcloud sql databases create urlopy --instance=urlopy-pg
gcloud sql users create urlopy_user --instance=urlopy-pg --password=CHANGE_ME
```

Connection string ustaw jako `DATABASE_URL`, np:

- `postgresql://urlopy_user:CHANGE_ME@/urlopy?host=/cloudsql/TWOJ_PROJECT_ID:europe-central2:urlopy-pg`

## 5. Zmienne srodowiskowe API (Cloud Run)

Ustaw wszystkie wymagane zmienne:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `COMMUNICATION_MODE`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `MAILBOX_ADDRESS`
- `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`
- `ONEDRIVE_DRIVE_ID`, `ONEDRIVE_BASE_PATH`
- `GOOGLE_CALENDAR_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`
- opcjonalnie `GOOGLE_CALENDAR_TIMEZONE`, `GOOGLE_CALENDAR_LEAVE_TITLE_PREFIX`
- opcjonalnie `FIREBASE_SERVICE_ACCOUNT_JSON`

## 6. Wdrozen ie panelu web

Opcja A (najprostsza): tez do Cloud Run.

Ustaw:

- `NEXT_PUBLIC_API_URL=https://urlopy-api-xxxxx-uc.a.run.app`

Opcja B: Firebase Hosting dla web + API na Cloud Run.

## 7. Mobile (EAS)

W `apps/mobile-worker/eas.json` ustaw publiczny URL API (Cloud Run lub domena wlasna):

- `EXPO_PUBLIC_API_URL=https://urlopy-api-xxxxx-uc.a.run.app`

Potem zbuduj APK:

```powershell
npm --prefix apps/mobile-worker run build:apk
```

## 8. Domena wlasna (opcjonalnie)

Zalecane dla produkcji:

- `https://api.twojadomena.pl` -> Cloud Run
- `https://panel.twojadomena.pl` -> web hosting

Wtedy ustaw:

- `CORS_ORIGINS=https://panel.twojadomena.pl`
- `NEXT_PUBLIC_API_URL=https://api.twojadomena.pl`
- `EXPO_PUBLIC_API_URL=https://api.twojadomena.pl`

## 9. Co daje to podejscie

- wykorzystujesz istniejace konto Google do hostingu 24/7,
- wykorzystujesz istniejace konto Microsoft/OneDrive do plikow,
- aplikacja dziala przez internet mobilny i Wi-Fi bez uruchomionego komputera lokalnego.

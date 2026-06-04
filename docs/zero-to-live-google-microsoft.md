# Zero to live: Google Cloud + Microsoft OneDrive

Ten scenariusz jest dla Ciebie, jesli:

- nie masz jeszcze projektu Google Cloud,
- nie masz domeny,
- chcesz uruchomic aplikacje 24/7 przez internet mobilny i Wi-Fi,
- chcesz wykorzystac OneDrive do zalacznikow.

## 1) Utworz projekt Google Cloud

1. Wejdz do Google Cloud Console.
2. Utworz nowy projekt, np. `urlopy-prod`.
3. Wejdz w Billing i podepnij metode platnosci.
4. Wlacz API:
   - Cloud Run API
   - Cloud SQL Admin API
   - Artifact Registry API
   - Cloud Build API
   - Secret Manager API

## 2) Otworz Cloud Shell (bez lokalnego gcloud)

W prawym gornym rogu Google Cloud kliknij Cloud Shell.
Wszystkie komendy uruchamiasz tam.

## 3) Utworz baze PostgreSQL (Cloud SQL)

W Cloud Shell uruchom:

gcloud config set project TWOJ_PROJECT_ID
gcloud sql instances create urlopy-pg --database-version=POSTGRES_16 --tier=db-custom-1-3840 --region=europe-central2
gcloud sql databases create urlopy --instance=urlopy-pg
gcloud sql users create urlopy_user --instance=urlopy-pg --password=CHANGE_ME

## 4) Wdroz API do Cloud Run

Najprosciej przez Cloud Build + Cloud Run.
Jesli nie masz jeszcze Dockerfile dla API, uzyj instrukcji z:

- docs/google-cloud-onedrive-deploy.md

Komendy (Cloud Shell):

gcloud builds submit --tag europe-central2-docker.pkg.dev/TWOJ_PROJECT_ID/urlopy/urlopy-api
gcloud run deploy urlopy-api --image europe-central2-docker.pkg.dev/TWOJ_PROJECT_ID/urlopy/urlopy-api --region europe-central2 --allow-unauthenticated

Po deployu dostaniesz adres API, np.:

https://urlopy-api-xxxxx-uc.a.run.app

## 5) Skonfiguruj Microsoft OneDrive (Entra)

1. Wejdz do portal.azure.com.
2. Entra ID -> App registrations -> New registration.
3. Dodaj API permission: Microsoft Graph -> Application permission -> Files.ReadWrite.All.
4. Kliknij Grant admin consent.
5. W Certificates and secrets utworz Client Secret.
6. Zapisz wartosci:
   - Tenant ID
   - Client ID
   - Client Secret
7. Odczytaj OneDrive Drive ID (docelowy dysk/folder firmy).

## 6) Ustaw zmienne srodowiskowe API (Cloud Run)

W Cloud Run service urlopy-api ustaw:

- DATABASE_URL
- JWT_SECRET
- CORS_ORIGINS
- COMMUNICATION_MODE
- SMTP_HOST
- SMTP_PORT
- SMTP_USER
- SMTP_PASS
- SMTP_FROM
- MAILBOX_ADDRESS
- MS_TENANT_ID
- MS_CLIENT_ID
- MS_CLIENT_SECRET
- ONEDRIVE_DRIVE_ID
- ONEDRIVE_BASE_PATH

Uwaga: DATABASE_URL dla Cloud SQL przez unix socket:

postgresql://urlopy_user:HASLO@/urlopy?host=/cloudsql/TWOJ_PROJECT_ID:europe-central2:urlopy-pg

## 7) Wdroz panel web

Mozesz wdrozyc na Cloud Run tak samo jak API.
Najwazniejsze: ustaw dla weba

- NEXT_PUBLIC_API_URL=https://urlopy-api-xxxxx-uc.a.run.app

## 8) Podlacz mobile

W pliku apps/mobile-worker/eas.json ustaw:

- EXPO_PUBLIC_API_URL=https://urlopy-api-xxxxx-uc.a.run.app

Potem zbuduj nowa wersje APK:

npm --prefix apps/mobile-worker run build:apk

## 9) Test koncowy

1. Otworz API /health i sprawdz 200.
2. Zaloguj sie przez panel web.
3. Zaloguj sie przez mobile.
4. Dodaj zalacznik i sprawdz zapis do OneDrive.

Po tych krokach aplikacja dziala stale przez internet, bez lokalnego komputera.

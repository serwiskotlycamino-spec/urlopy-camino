# Urlopy Camino

Projekt jest przygotowany jako monorepo z trzema aplikacjami:

- apps/web-admin - panel web dla administratora i przelozonego (PC)
- apps/api - backend API (NestJS)
- apps/mobile-worker - aplikacja Android (Expo/React Native)

## Co juz zostalo przygotowane

- Struktura katalogow pod web, API, mobile i shared package.
- Konfiguracja monorepo przez npm workspaces.
- docker-compose.yml z PostgreSQL.
- Szablon zmiennych srodowiskowych .env.example.
- Dzialajacy scaffold Next.js, NestJS i Expo.

## Natychmiastowa komunikacja

MVP komunikuje sie wielokanalowo:

- Realtime SSE na panelu web.
- Powiadomienia in-app dla pracownika i managera.
- E-mail fallback przez SMTP (zapis statusu w bazie).
- Push FCM (jesli skonfigurowany service account i device token).

Aktualna skrzynka systemowa do komunikacji e-mail:

- serwis@kotlycamino.pl

## Tryb prosty: komunikacja tylko e-mail

Mozemy prowadzic obieg wnioskow i decyzji wyłącznie przez skrzynke serwis@kotlycamino.pl.

Aby wymusic tylko ten kanal, ustaw:

- COMMUNICATION_MODE=EMAIL_ONLY

W tym trybie backend nie wysyla powiadomien in-app/push/realtime, a informacje ida wyłącznie przez e-mail.

Szczegoly formatu i walidacji tematow:

- docs/email-workflow.md

Przykladowe tematy:

- URLOP | EMP:123 | OD:2026-07-01 | DO:2026-07-05
- DECYZJA | REQ:456 | APPROVED
- DECYZJA | REQ:456 | REJECTED | POWOD:Brak zastepstwa

## Wymagania lokalne

- Node.js LTS (zainstalowany)
- npm (zainstalowany)
- Docker Desktop (opcjonalnie, do uruchomienia PostgreSQL)

## Dane testowe logowania

- Admin: admin@firma.local / admin123
- Manager: szef@firma.local / szef123
- Pracownik: pracownik@firma.local / pracownik123

## Trwalosc danych

MVP zapisuje dane w PostgreSQL i odtwarza je po restarcie serwera:

- baza: PostgreSQL (DATABASE_URL)
- tabele: users, leave_requests, notifications, refresh_tokens, leave_request_attachments

## Bezpieczenstwo API

- Logowanie zwraca prawdziwy JWT.
- Hasla sa przechowywane jako hash bcrypt (z migracja starych plaintext przy logowaniu).
- Endpointy biznesowe sa chronione przez Authorization: Bearer token.
- Dostepne sa refresh tokeny z rotacja (endpoint /auth/refresh).
- Dostepne jest globalne wylogowanie uniewazniajace aktywne refresh tokeny (endpoint /auth/logout).
- Dostepne jest wylogowanie pojedynczej sesji przez refresh token (endpoint /auth/logout-session).
- Dostepne sa zalaczniki OneDrive dla wnioskow urlopowych (endpointy /attachments).
- Web i mobile maja przyciski dla obu akcji: wyloguj to urzadzenie oraz wyloguj wszystkie urzadzenia.
- Web: upload pliku do zalacznikow przy kazdym oczekujacym wniosku.
- Mobile: upload zalacznika tekstowego do wskazanego ID wniosku.
- EMPLOYEE: skladanie wnioskow, podglad swoich danych.
- MANAGER/ADMIN: lista oczekujacych i decyzje.

## Konfiguracja .env

Ustaw zmienne zgodnie z .env.example:

- DATABASE_URL
- JWT_SECRET
- CORS_ORIGINS
- COMMUNICATION_MODE (`EMAIL_ONLY` lub `MULTI`)
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
- FIREBASE_SERVICE_ACCOUNT_JSON
- MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET
- ONEDRIVE_DRIVE_ID, ONEDRIVE_BASE_PATH
- NEXT_PUBLIC_API_URL (web)
- EXPO_PUBLIC_API_URL (mobile)

Pliki pomocnicze env:

- apps/web-admin/.env.example
- apps/mobile-worker/.env.example

## Instalacja zaleznosci

```powershell
npm --prefix apps/web-admin install
npm --prefix apps/api install
npm --prefix apps/mobile-worker install
```

## Uruchamianie

### 1) Backend API

```powershell
npm --prefix apps/api run start:dev
```

### 2) Panel web

```powershell
npm --prefix apps/web-admin run dev
```

### 3) Aplikacja mobilna

```powershell
npm --prefix apps/mobile-worker run start
```

Tryb deweloperski (`start` + debug build) wymaga dzialajacego Metro na komputerze.
Jesli telefon ma dzialac bez podlaczenia do komputera, uruchamiaj build release:

```powershell
npm --prefix apps/mobile-worker run android:release
```

Aplikacja mobilna jest skonfigurowana na polaczenie CLOUD i domyslnie laczy sie z publicznym API.

### 3a) Wersja instalacyjna Android (APK)

W katalogu `apps/mobile-worker` jest gotowy profil EAS `preview` budujacy APK.

```powershell
npm --prefix apps/mobile-worker run build:apk
```

Wymagane: zalogowanie do Expo (`eas login`) oraz konto Expo.

### 4) Baza PostgreSQL (opcjonalnie)

```powershell
docker compose up -d
```

Jesli `docker` nie jest dostepny, backend i frontend nadal uruchamiaja sie poprawnie, ale bez lokalnej bazy PostgreSQL.

## Kolejny krok MVP

Aktualnie wdrozone:

1. Role: ADMIN, MANAGER, EMPLOYEE
2. Wniosek urlopowy i workflow PENDING -> APPROVED/REJECTED
3. Powiadomienia realtime (SSE) dla panelu managera
4. E-mail fallback SMTP i zapis kazdej notyfikacji w bazie
5. Push FCM (warunkowo, jesli skonfigurowany)
6. JWT + guardy + role-based access
7. Refresh tokeny z rotacja i tabela refresh_tokens
8. Hashowanie hasel bcrypt + automatyczny upgrade kont testowych
9. Globalne wylogowanie z uniewaznianiem wszystkich aktywnych refresh tokenow usera
10. Wylogowanie pojedynczej sesji po refresh tokenie
11. Zalaczniki do wnioskow: upload do OneDrive + metadane w PostgreSQL

Nastepne rozszerzenia:

1. Monitoring i metryki dostarczen SMTP/FCM
2. Dashboard operacyjny (alerty i statystyki workflow)

## Wdrozenie globalne (Azure + OneDrive)

Szczegolowa instrukcja krok po kroku znajduje sie w:

- docs/azure-onedrive-deploy.md

Najwazniejsze punkty:

1. Backend hostuj w Azure App Service.
2. Baze danych trzymaj w Azure PostgreSQL.
3. Zalaczniki trzymaj w OneDrive przez Microsoft Graph (app registration w Entra ID).
4. Ustaw `CORS_ORIGINS` i publiczne URL API dla web/mobile.

Alternatywa na istniejacych kontach Google + Microsoft:

- docs/google-cloud-onedrive-deploy.md

Scenariusz od zera (bez projektu Google i bez domeny):

- docs/zero-to-live-google-microsoft.md

Automatyczny deploy z GitHub do Google Cloud Run:

- docs/github-cicd-gcp.md

## Always-on (internet mobilny i Wi-Fi)

Jesli aplikacja ma dzialac zawsze po internecie, backend i baza nie moga dzialac na komputerze lokalnym.

Uzyj gotowej instrukcji:

- docs/always-on-deploy.md

Dla szybkiego wdrozenia 24/7 jest przygotowany blueprint:

- render.yaml

## Szybki start: Azure App Settings

Gotowe pliki pomocnicze:

- docs/azure-appsettings.template.json
- docs/azure-appsettings-setup.ps1
- docs/azure-client-env.md

Uzycie (Azure CLI + PowerShell):

```powershell
./docs/azure-appsettings-setup.ps1 -ResourceGroup "twoja-rg" -WebAppName "twoj-api-app"
```

Przed uruchomieniem uzupelnij placeholdery `CHANGE_ME` w `docs/azure-appsettings.template.json`.

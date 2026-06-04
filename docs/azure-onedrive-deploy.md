# Azure + OneDrive deployment (global internet)

## 1. Cel architektury

- API: Azure App Service (Node/NestJS)
- Baza danych: Azure Database for PostgreSQL
- Pliki/zalaczniki: OneDrive przez Microsoft Graph
- Front web: Vercel/Static hosting lub Azure Static Web Apps
- Mobile: Expo build z publicznym `EXPO_PUBLIC_API_URL`

## 2. Przygotowanie Azure i Entra ID

1. Utworz Resource Group.
2. Utworz Azure Database for PostgreSQL.
3. Utworz Azure App Service (Linux, Node 22+).
4. W Microsoft Entra ID zarejestruj aplikacje backend.
5. Dodaj uprawnienia Microsoft Graph Application: `Files.ReadWrite.All`.
6. Nadaj admin consent dla tenantu.
7. W OneDrive ustal docelowy drive ID.

## 3. Zmienne srodowiskowe backendu

Ustaw w App Service > Configuration:

Skrzynka systemowa dla SMTP (aktualnie): `serwis@kotlycamino.pl`

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `COMMUNICATION_MODE` (`EMAIL_ONLY` albo `MULTI`)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `ONEDRIVE_DRIVE_ID`
- `ONEDRIVE_BASE_PATH`

## 4. Build i start dla App Service

- Build command: `npm --prefix apps/api install && npm --prefix apps/api run build`
- Start command: `npm --prefix apps/api run start`

## 5. CORS i domeny

W `CORS_ORIGINS` podaj publiczne domeny panelu web i ewentualnego bridge mobilnego, np:

- `https://panel.twojadomena.pl`
- `https://www.panel.twojadomena.pl`

## 6. Konfiguracja klientow

### Web (Next.js)

Ustaw w hostingu weba:

- `NEXT_PUBLIC_API_URL=https://api.twojadomena.pl`

### Mobile (Expo)

Ustaw w build profile lub `.env`:

- `EXPO_PUBLIC_API_URL=https://api.twojadomena.pl`

## 7. Endpointy OneDrive attachments

W API sa gotowe endpointy:

- `POST /attachments`
- `GET /attachments/leave-request/:id`

`POST /attachments` przyjmuje:

- `leaveRequestId`
- `fileName`
- `contentBase64`

Metadane sa zapisywane w PostgreSQL (`leave_request_attachments`), a plik trafia do OneDrive.

## 8. Test end-to-end

1. `GET /health` -> 200
2. Login managera i pracownika
3. Utworzenie wniosku urlopowego
4. Dodanie zalacznika przez `POST /attachments`
5. Akceptacja/odrzucenie
6. Weryfikacja notyfikacji i SSE

## 9. Operacyjnie

- Wlacz backup PostgreSQL.
- Wlacz logi App Service i alerty.
- Rotuj `JWT_SECRET` i `MS_CLIENT_SECRET`.
- Nie loguj pelnej tresci tokenow ani sekretow.

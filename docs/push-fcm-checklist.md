# Push FCM checklist (Render / Cloud Run)

Cel: powiadomienia push maja dzialac takze po zamknieciu aplikacji mobilnej.

## 1) Firebase service account

1. Wejdz do Firebase Console dla projektu FCM.
2. Otworz Project settings -> Service accounts.
3. Wygeneruj nowy klucz JSON i pobierz plik.
4. Skopiuj zawartosc JSON jako jeden ciag tekstowy do zmiennej srodowiskowej FIREBASE_SERVICE_ACCOUNT_JSON.

Wazne:
- JSON musi byc pelny (nie placeholder).
- Nie zostawiaj wartosci testowej typu your-fcm-project-id.

## 2) Ustawienia backendu API

Ustaw na backendzie produkcyjnym:
- COMMUNICATION_MODE=MULTI
- FIREBASE_SERVICE_ACCOUNT_JSON=<pelny-json-service-account>

Opcjonalnie (mail fallback):
- SMTP_HOST
- SMTP_PORT
- SMTP_USER
- SMTP_PASS
- SMTP_FROM

## 3) Wymuszenie trybu MULTI w bazie

Po wdrozeniu API ustaw w bazie:

INSERT INTO app_settings(key, value, updated_at)
VALUES ('communication_mode', 'MULTI', NOW())
ON CONFLICT(key) DO UPDATE
SET value = EXCLUDED.value, updated_at = NOW();

Kontrola:

SELECT key, value FROM app_settings WHERE key = 'communication_mode';

Oczekiwany wynik: MULTI

## 4) Rejestracja tokenu urzadzenia

Po stronie mobilki:
1. Zaloguj sie ponownie po aktualizacji aplikacji.
2. Wejdz raz na ekran glowny i zostaw aplikacje na chwile na pierwszym planie.
3. To zapisze device_token na backendzie.

Kontrola w DB:

SELECT id, email, device_token
FROM users
WHERE email = '<email-uzytkownika-testowego>';

Oczekiwany wynik: device_token nie jest NULL.

## 5) Test end-to-end push

Scenariusz:
1. Pracownik sklada wniosek.
2. Zamknij aplikacje pracownika (ubij z listy ostatnich aplikacji).
3. Admin zatwierdza lub odrzuca wniosek.
4. Pracownik powinien dostac systemowe push (FCM).

Kontrola w DB (logi kanalu PUSH):

SELECT id, channel, event, status, created_at
FROM notifications
WHERE user_id = <id-uzytkownika>
ORDER BY id DESC
LIMIT 20;

Interpretacja:
- PUSH + SENT: backend wyslal push poprawnie.
- PUSH + FAILED: problem z FCM credentials lub tokenem urzadzenia.
- Brak rekordow PUSH: brak tokenu urzadzenia albo stary backend bez poprawki.

## 6) Gdy nadal nie dziala

Sprawdz po kolei:
1. Czy backend produkcyjny ma nowa wersje kodu (push nie jest blokowany przez EMAIL_ONLY).
2. Czy FIREBASE_SERVICE_ACCOUNT_JSON jest poprawny i pelny.
3. Czy communication_mode w app_settings jest MULTI.
4. Czy user ma zapisany device_token.
5. Czy na telefonie sa wlaczone powiadomienia dla aplikacji.

## 7) Szybki status (minimum)

Push bedzie dzialal, jesli wszystkie 4 warunki sa spelnione:
- backend z poprawka push,
- COMMUNICATION_MODE=MULTI,
- poprawny FIREBASE_SERVICE_ACCOUNT_JSON,
- device_token zapisany dla usera.

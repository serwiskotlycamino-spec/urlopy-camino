# Prosty workflow e-mail (serwis@kotlycamino.pl)

## Cel

Uproszczona komunikacja miedzy pracownikiem i przelozonym przez jedna skrzynke:

- serwis@kotlycamino.pl

## Zasady identyfikacji

1. Nadawca musi byc zgodny z adresem e-mail pracownika zapisanym w bazie.
2. Temat wiadomosci musi zawierac wymagane pola.
3. Jesli temat jest niepoprawny, system odsyla odpowiedz z instrukcja poprawnego formatu.

## Format tematu - nowy wniosek

URLOP | EMP:123 | OD:2026-07-01 | DO:2026-07-05

Opcjonalnie tresc wiadomosci moze zawierac powod.

## Format tematu - decyzja przelozonego

DECYZJA | REQ:456 | APPROVED

lub

DECYZJA | REQ:456 | REJECTED | POWOD:Brak zastępstwa

## Walidacja minimalna

1. EMP i REQ musza byc liczbami dodatnimi.
2. OD i DO musza miec format YYYY-MM-DD.
3. DO nie moze byc wczesniej niz OD.
4. APPROVED/REJECTED tylko z dozwolonego slownika.

## Odpowiedzi automatyczne

1. Potwierdzenie przyjecia nowego wniosku.
2. Potwierdzenie zarejestrowania decyzji.
3. Informacja o bledzie formatu.
4. Informacja o braku uprawnien.

## Ustawienia SMTP

- SMTP_HOST=smtp.office365.com
- SMTP_PORT=587
- SMTP_USER=serwis@kotlycamino.pl
- SMTP_FROM=serwis@kotlycamino.pl
- COMMUNICATION_MODE=EMAIL_ONLY

## Kolejny etap implementacji

1. Odbior poczty przychodzacej z Microsoft Graph (polling/webhook).
2. Parser tematow i mapowanie na akcje biznesowe.
3. Log audytowy wiadomosci przychodzacych i przetworzonych.

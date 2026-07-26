# System Urlopowy Camino 1.1.2

## Rejestr zmian

## 1.1

- Dodano osobną zakładkę Dane wspólne w Opcjach do wskazywania folderu bazy i ustawień.
- Dodano przełączanie katalogu danych na OneDrive lub inny wspólny folder z migracją plików.
- Dodano nowy instalator aktualizacyjny z automatycznym backupem danych przed aktualizacją.

## 1.1.1

- Poprawiono pipeline instalatora: build zawsze pobiera świeży publish z aktualnego projektu.
- Ujednolicono numer wersji aplikacji i instalatora, aby uniknąć instalacji starej paczki.

## 1.1.2

- Naprawiono utratę wniosków i danych kalendarza po aktualizacji.
- Instalator wykonuje dodatkowy backup krytycznych plików urlopowych i auto-przywraca je po instalacji, jeśli zostały wyczyszczone lub uszkodzone.

- Dodano panel administratora desktop z logowaniem i obsługą sesji API.
- Dodano konfigurację API przeniesioną z głównego panelu do osobnej zakładki w Opcjach.
- Dodano zakładkę Kosz w Opcjach z przywracaniem i trwałym usuwaniem wpisów.
- Dodano zakładkę Adres email w Opcjach z konfiguracją Gmail do komunikacji systemowej.
- Dodano zakładkę Dane firmy w Opcjach.
- Dodano zapamiętywanie rozmiarów i pozycji okien oraz szerokości kolumn.
- Dodano obsługę użytkowników: tworzenie, edycję, usuwanie, zmianę roli oraz edycję ID użytkownika.
- Dodano lokalne przepinanie danych po zmianie ID użytkownika.
- Dodano pełną listę wniosków urlopowych z komentarzem decyzji, usuwaniem i archiwizacją.
- Dodano archiwum wniosków oraz przenoszenie pozycji do kosza.
- Dodano ręczną edycję wniosku urlopowego przez administratora.
- Dodano możliwość zmiany decyzji dla wniosku z poziomu edycji.
- Dodano synchronizację lokalnej bazy aktywnych i archiwalnych wniosków z głównym oknem i kalendarzem.
- Dodano zabezpieczenia przed znikaniem list przy niepełnych lub pustych odpowiedziach API.
- Dodano kalendarz wniosków obejmujący wnioski przetwarzane i zatwierdzone.
- Dodano kolorowanie dni w kalendarzu: zielone dla zatwierdzonych, czerwone dla przetwarzanych i podział góra/dół dla nakładających się statusów.
- Dodano podpowiedzi tooltip dla aktywności w konkretnym dniu kalendarza.
- Dodano okno listy wniosków z wybranego dnia z akcjami akceptacji, odrzucenia, edycji i dodawania nowych wpisów.
- Dodano mechanizmy fallback tras API dla edycji, usuwania i decyzji wniosków urlopowych.
- Dodano historię użytkownika i lokalne notatki aktywności.
- Dodano eksport danych użytkownika do PDF.
- Dodano limity urlopowe oraz ich ręczną aktualizację.
- Dodano obsługę wyjazdów służbowych: lista, tworzenie, edycja, decyzje administratora i usuwanie.
- Dodano poprawną normalizację godzin wyjazdu w formatach HH:mm i HH:mm:ss.
- Dodano fallback tras API dla decyzji wyjazdów służbowych.
- Dodano lokalny magazyn SQLite dla aktywnych, archiwalnych i usuniętych wpisów.
- Dodano odświeżanie klienta API po zamknięciu Opcji.
- Ujednolicono komunikaty zwrotne i aktualizację widoków po operacjach administracyjnych.
# Instalator PC

Pliki instalatora desktop dla System Urlopowy Camino 1.1.

## Zawartość

- `SystemUrlopowyCamino_UpdateBackup.iss` - skrypt Inno Setup dla aktualizacji z backupem danych.
- `Setup.ps1` - skrypt publikujący aplikację desktop i budujący instalator.
- `output/` - katalog wynikowy dla publish i gotowego instalatora.
- `isscc_build.txt` - log ostatniego uruchomienia skryptu.

## Wymagania

- .NET SDK
- Inno Setup 6 (`ISCC.exe`) do zbudowania instalatora `.exe`

## Uruchomienie

```powershell
./installer/Setup.ps1
```

Instalator wykrywa poprzednią instalację, tworzy backup danych i umożliwia przywrócenie poprzedniej wersji.
Skrypt zawsze buduje świeży `publish` z bieżącego `apps/desktop-admin-csharp/DesktopAdmin/DesktopAdmin.csproj` i dopiero z niego tworzy plik `.exe` instalatora.

Sam publish bez kompilacji instalatora:

```powershell
./installer/Setup.ps1 -SkipInstaller
```
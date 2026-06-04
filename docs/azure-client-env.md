# Publiczne zmienne klientow (web i mobile)

## Web admin

W hostingu panelu web ustaw:

- NEXT_PUBLIC_API_URL=https://api.twojadomena.pl

## Mobile worker (Expo)

W build profile lub .env ustaw:

- EXPO_PUBLIC_API_URL=https://api.twojadomena.pl

## Wazne

- API URL musi wskazywac publiczny endpoint backendu.
- Domena panelu web musi byc wpisana w CORS_ORIGINS backendu.

import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type User = {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  managerId: number | null;
};

type LeaveRequest = {
  id: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3001';

export default function App() {
  const [apiUrlInput, setApiUrlInput] = useState(API_URL);
  const [email, setEmail] = useState('pracownik@firma.local');
  const [password, setPassword] = useState('pracownik123');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const apiUrl = useMemo(() => {
    const trimmed = apiUrlInput.trim();
    if (!trimmed) {
      return API_URL;
    }
    return trimmed.replace(/\/+$/, '');
  }, [apiUrlInput]);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    setRequests([]);
  }, []);

  async function login() {
    setBusy(true);
    setError('');

    try {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        setError('Logowanie nieudane.');
        return;
      }

      const data = (await res.json()) as { user: User; accessToken: string; refreshToken: string };
      setUser(data.user);
      setToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      setError('');
    } catch {
      setError(`Brak polaczenia z serwerem API (${apiUrl}).`);
    } finally {
      setBusy(false);
    }
  }

  const authFetch = useCallback(async (input: string, init?: RequestInit) => {
    if (!token) {
      return null;
    }

    let first: Response;
    try {
      first = await fetch(input, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      setError(`Brak polaczenia z serwerem API (${apiUrl}).`);
      return null;
    }

    if (first.status !== 401 || !refreshToken) {
      return first;
    }

    let refreshRes: Response;
    try {
      refreshRes = await fetch(`${apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      setError(`Brak polaczenia z serwerem API (${apiUrl}).`);
      return first;
    }

    if (!refreshRes.ok) {
      return first;
    }

    const refreshed = (await refreshRes.json()) as { accessToken: string; refreshToken: string };
    setToken(refreshed.accessToken);
    setRefreshToken(refreshed.refreshToken);

    try {
      return await fetch(input, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${refreshed.accessToken}`,
        },
      });
    } catch {
      setError(`Brak polaczenia z serwerem API (${apiUrl}).`);
      return null;
    }
  }, [apiUrl, token, refreshToken]);

  const loadMyRequests = useCallback(async () => {
    if (!user) {
      return;
    }

    const res = await authFetch(`${apiUrl}/leave-requests/mine`);
    if (!res) {
      return;
    }
    if (!res.ok) {
      return;
    }

    const rows = (await res.json()) as LeaveRequest[];
    setRequests(rows);
  }, [apiUrl, authFetch, user]);

  async function logoutCurrentSession() {
    if (!token || !refreshToken) {
      clearSession();
      return;
    }

    try {
      await fetch(`${apiUrl}/auth/logout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      setError(`Nie udalo sie wylogowac sesji na serwerze (${apiUrl}).`);
    }

    clearSession();
  }

  async function logoutAllSessions() {
    if (!token) {
      clearSession();
      return;
    }

    try {
      await fetch(`${apiUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      setError(`Nie udalo sie wylogowac na serwerze (${apiUrl}).`);
    }

    clearSession();
  }

  useEffect(() => {
    if (!user) {
      return;
    }

    void loadMyRequests();
  }, [loadMyRequests, user]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.card}>
        <Text style={styles.title}>Urlopy Camino</Text>

        {!user && (
          <>
            <TextInput
              style={styles.input}
              value={apiUrlInput}
              onChangeText={setApiUrlInput}
              placeholder="Adres API, np. http://192.168.20.45:3001"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardAppearance="light"
              selectionColor="#0f172a"
            />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardAppearance="light"
              selectionColor="#0f172a"
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Haslo"
              placeholderTextColor="#64748b"
              keyboardAppearance="light"
              selectionColor="#0f172a"
              secureTextEntry
            />
            <TouchableOpacity style={styles.button} onPress={() => void login()} disabled={busy}>
              <Text style={styles.buttonText}>Zaloguj</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>Test pracownika: pracownik@firma.local / pracownik123</Text>
            <Text style={styles.hint}>Aktualny API: {apiUrl}</Text>
          </>
        )}

        {user && (
          <>
            <View style={styles.logoutRow}>
              <TouchableOpacity style={styles.ghostButton} onPress={() => void logoutCurrentSession()}>
                <Text style={styles.ghostButtonText}>Wyloguj to urzadzenie</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.button} onPress={() => void logoutAllSessions()}>
                <Text style={styles.buttonText}>Wyloguj wszystkie</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subtitle}>Moje wnioski</Text>
            <FlatList
              data={requests}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <View style={styles.requestCard}>
                  <Text style={styles.row}>
                    #{item.id} {item.leaveType} {item.startDate} - {item.endDate} [{item.status}]
                  </Text>
                  <Text style={styles.row}>Powod: {item.reason || '-'}</Text>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.row}>Brak wnioskow.</Text>}
            />
          </>
        )}

        {busy && <ActivityIndicator color="#0f172a" />}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    maxHeight: '95%',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 10,
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  button: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 11,
    marginTop: 4,
  },
  logoutRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  ghostButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  ghostButtonText: {
    color: '#0f172a',
    fontWeight: '600',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  hint: {
    marginTop: 8,
    color: '#475569',
    fontSize: 12,
  },
  row: {
    color: '#334155',
    marginBottom: 6,
  },
  requestCard: {
    marginBottom: 8,
  },
  error: {
    marginTop: 8,
    color: '#be123c',
  },
});

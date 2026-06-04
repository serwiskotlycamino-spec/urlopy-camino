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
};

type LeaveRequest = {
  id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

type Attachment = {
  id: number;
  leave_request_id: number;
  file_name: string;
  one_drive_web_url: string;
  file_size: number;
};

type NotificationItem = {
  id: number;
  message: string;
  createdAt: string;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3001';

function encodeUtf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;

    const triple = (a << 16) | (b << 8) | c;
    output += chars[(triple >> 18) & 63];
    output += chars[(triple >> 12) & 63];
    output += i + 1 < bytes.length ? chars[(triple >> 6) & 63] : '=';
    output += i + 2 < bytes.length ? chars[triple & 63] : '=';
  }

  return output;
}

export default function App() {
  const [email, setEmail] = useState('pracownik@firma.local');
  const [password, setPassword] = useState('pracownik123');
  const [leaveType, setLeaveType] = useState('ANNUAL');
  const [startDate, setStartDate] = useState('2026-07-01');
  const [endDate, setEndDate] = useState('2026-07-05');
  const [reason, setReason] = useState('Wypoczynek rodzinny');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [attachmentsByRequest, setAttachmentsByRequest] = useState<Record<number, Attachment[]>>({});
  const [attachmentRequestId, setAttachmentRequestId] = useState('');
  const [attachmentText, setAttachmentText] = useState('Krotka notatka do wniosku.');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isEmployee = useMemo(() => user?.role === 'EMPLOYEE', [user]);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    setRequests([]);
    setNotifications([]);
    setAttachmentsByRequest({});
    setAttachmentRequestId('');
    setAttachmentText('Krotka notatka do wniosku.');
  }, []);

  async function login() {
    setBusy(true);
    setError('');

    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    setBusy(false);

    if (!res.ok) {
      setError('Logowanie nieudane.');
      return;
    }

    const data = (await res.json()) as { user: User; accessToken: string; refreshToken: string };
    setUser(data.user);
    setToken(data.accessToken);
    setRefreshToken(data.refreshToken);
  }

  const authFetch = useCallback(async (input: string, init?: RequestInit) => {
    if (!token) {
      return null;
    }

    const first = await fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });

    if (first.status !== 401 || !refreshToken) {
      return first;
    }

    const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!refreshRes.ok) {
      return first;
    }

    const refreshed = (await refreshRes.json()) as { accessToken: string; refreshToken: string };
    setToken(refreshed.accessToken);
    setRefreshToken(refreshed.refreshToken);

    return fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${refreshed.accessToken}`,
      },
    });
  }, [token, refreshToken]);

  const loadMyRequests = useCallback(async () => {
    if (!user || !token) {
      return;
    }

    const res = await authFetch(`${API_URL}/leave-requests/mine`);
    if (!res) {
      return;
    }
    if (!res.ok) {
      return;
    }

    const rows = (await res.json()) as LeaveRequest[];
    setRequests(rows);

    await Promise.all(
      rows.map(async (request) => {
        const attachmentsRes = await authFetch(`${API_URL}/attachments/leave-request/${request.id}`);
        if (!attachmentsRes || !attachmentsRes.ok) {
          return;
        }
        const items = (await attachmentsRes.json()) as Attachment[];
        setAttachmentsByRequest((prev) => ({ ...prev, [request.id]: items }));
      }),
    );
  }, [authFetch, token, user]);

  async function uploadTextAttachment() {
    if (!attachmentRequestId.trim() || !attachmentText.trim()) {
      setError('Podaj ID wniosku i tresc notatki.');
      return;
    }

    const requestId = Number(attachmentRequestId);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      setError('ID wniosku jest niepoprawne.');
      return;
    }

    setBusy(true);
    setError('');

    const contentBase64 = encodeUtf8ToBase64(attachmentText);
    const fileName = `zalacznik-${requestId}-${Date.now()}.txt`;

    const res = await authFetch(`${API_URL}/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        leaveRequestId: requestId,
        fileName,
        contentBase64,
      }),
    });

    setBusy(false);

    if (!res || !res.ok) {
      setError('Nie udalo sie przeslac zalacznika.');
      return;
    }

    const listRes = await authFetch(`${API_URL}/attachments/leave-request/${requestId}`);
    if (!listRes || !listRes.ok) {
      return;
    }
    const list = (await listRes.json()) as Attachment[];
    setAttachmentsByRequest((prev) => ({ ...prev, [requestId]: list }));
    setAttachmentText('');
  }

  const loadNotifications = useCallback(async () => {
    if (!user || !token) {
      return;
    }

    const res = await authFetch(`${API_URL}/notifications/mine`);
    if (!res) {
      return;
    }
    if (!res.ok) {
      return;
    }

    const rows = (await res.json()) as NotificationItem[];
    setNotifications(rows.slice(0, 5));
  }, [authFetch, token, user]);

  async function submitRequest() {
    if (!user || !token) {
      return;
    }

    setBusy(true);
    setError('');

    const res = await authFetch(`${API_URL}/leave-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        leaveType,
        startDate,
        endDate,
        reason,
      }),
    });

    if (!res) {
      setBusy(false);
      return;
    }

    setBusy(false);

    if (!res.ok) {
      setError('Nie udalo sie zlozyc wniosku.');
      return;
    }

    await loadMyRequests();
  }

  async function logoutCurrentSession() {
    if (!token || !refreshToken) {
      clearSession();
      return;
    }

    await fetch(`${API_URL}/auth/logout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ refreshToken }),
    });

    clearSession();
  }

  async function logoutAllSessions() {
    if (!token) {
      clearSession();
      return;
    }

    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    clearSession();
  }

  useEffect(() => {
    if (!user) {
      return;
    }

    void loadMyRequests();
    void loadNotifications();

    const timer = setInterval(() => {
      void loadMyRequests();
      void loadNotifications();
    }, 3000);

    return () => clearInterval(timer);
  }, [loadMyRequests, loadNotifications, user]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />

      <View style={styles.card}>
        <Text style={styles.title}>Urlopy Worker</Text>

        {!user && (
          <>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Haslo"
              secureTextEntry
            />
            <TouchableOpacity style={styles.button} onPress={() => void login()} disabled={busy}>
              <Text style={styles.buttonText}>Zaloguj</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>Test pracownika: pracownik@firma.local / pracownik123</Text>
          </>
        )}

        {user && isEmployee && (
          <>
            <View style={styles.logoutRow}>
              <TouchableOpacity style={styles.ghostButton} onPress={() => void logoutCurrentSession()}>
                <Text style={styles.ghostButtonText}>Wyloguj to urzadzenie</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.button} onPress={() => void logoutAllSessions()}>
                <Text style={styles.buttonText}>Wyloguj wszystkie</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subtitle}>Wniosek urlopowy</Text>
            <TextInput style={styles.input} value={leaveType} onChangeText={setLeaveType} placeholder="Typ urlopu" />
            <TextInput
              style={styles.input}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="Data od (YYYY-MM-DD)"
            />
            <TextInput
              style={styles.input}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="Data do (YYYY-MM-DD)"
            />
            <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Powod" />

            <TouchableOpacity style={styles.button} onPress={() => void submitRequest()} disabled={busy}>
              <Text style={styles.buttonText}>Wyslij wniosek</Text>
            </TouchableOpacity>

            <Text style={styles.subtitle}>Zalacznik tekstowy</Text>
            <TextInput
              style={styles.input}
              value={attachmentRequestId}
              onChangeText={setAttachmentRequestId}
              placeholder="ID wniosku"
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={attachmentText}
              onChangeText={setAttachmentText}
              placeholder="Tresc notatki"
              multiline
            />
            <TouchableOpacity style={styles.button} onPress={() => void uploadTextAttachment()} disabled={busy}>
              <Text style={styles.buttonText}>Wyslij zalacznik</Text>
            </TouchableOpacity>

            <Text style={styles.subtitle}>Ostatnie powiadomienia</Text>
            <FlatList
              data={notifications}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => <Text style={styles.row}>- {item.message}</Text>}
            />

            <Text style={styles.subtitle}>Moje wnioski</Text>
            <FlatList
              data={requests}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <View style={styles.requestCard}>
                  <Text style={styles.row}>
                    #{item.id} {item.leave_type} {item.start_date} - {item.end_date} [{item.status}]
                  </Text>
                  {(attachmentsByRequest[item.id] ?? []).map((attachment) => (
                    <Text key={attachment.id} style={styles.attachmentRow}>
                      - {attachment.file_name} ({Math.round(attachment.file_size / 1024)} KB)
                    </Text>
                  ))}
                </View>
              )}
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
    gap: 8,
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
  attachmentRow: {
    color: '#0f766e',
    marginBottom: 4,
    marginLeft: 4,
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  error: {
    marginTop: 8,
    color: '#be123c',
  },
});

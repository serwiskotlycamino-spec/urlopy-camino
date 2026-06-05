import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
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
  role: 'ADMIN' | 'EMPLOYEE';
  managerId: number | null;
};

type LeaveRequest = {
  id: number;
  leaveType: 'ANNUAL' | 'ON_DEMAND' | 'SICK' | 'UNPAID' | 'OTHER';
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  managerComment?: string | null;
};

type WorkTrip = {
  id: number;
  trip_date: string;
  start_time: string;
  end_time: string;
  destination: string | null;
  description: string | null;
  created_at: string;
};

type AppNotification = {
  id: number;
  event: string;
  message: string;
  status: string;
  created_at: string;
};

type LeaveLimit = {
  userId: number;
  year: number;
  annualDays: number;
  usedDays: number;
  remainingDays: number;
};

type PendingItem = {
  id: number;
  user_id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  manager_comment: string | null;
};

type ActiveTab = 'requests' | 'trips' | 'notifications' | 'admin';
type AdminSubTab = 'all-requests' | 'all-limits' | 'all-trips' | 'all-users';
type UserPickItem = { id: number; name: string; role: string; email: string };
type EmployeeLeaveSummary = {
  userId: number; name: string; email: string;
  year: number; annualDays: number; usedDays: number; remainingDays: number;
};
type WorkTripAdmin = {
  id: number; user_id: number; user_name: string | null;
  trip_date: string; start_time: string; end_time: string;
  destination: string | null; description: string | null;
};

const DEFAULT_LOGIN_USERS: UserPickItem[] = [
  { id: 1, name: 'Admin', email: 'admin@firma.local', role: 'ADMIN' },
  { id: 2, name: 'Pracownik', email: 'pracownik@firma.local', role: 'EMPLOYEE' },
];

type ApiLeaveRequest = {
  id: number;
  leave_type?: 'ANNUAL' | 'ON_DEMAND' | 'SICK' | 'UNPAID' | 'OTHER';
  leaveType?: 'ANNUAL' | 'ON_DEMAND' | 'SICK' | 'UNPAID' | 'OTHER';
  start_date?: string;
  startDate?: string;
  end_date?: string;
  endDate?: string;
  reason?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  manager_comment?: string | null;
};

const LEAVE_TYPES = [
  { value: 'ANNUAL', label: 'Wypoczynkowy' },
  { value: 'ON_DEMAND', label: 'Na zadanie' },
  { value: 'SICK', label: 'Chorobowy' },
  { value: 'UNPAID', label: 'Bezpłatny' },
  { value: 'OTHER', label: 'Inny' },
] as const;

const STATUS_META: Record<string, { label: string; background: string; color: string }> = {
  APPROVED:  { label: 'ZATWIERDZONY', background: '#dcfce7', color: '#166534' },
  REJECTED:  { label: 'ODRZUCONY',    background: '#fee2e2', color: '#b91c1c' },
  PENDING:   { label: 'PRZETWARZANY', background: '#ffedd5', color: '#c2410c' },
  CANCELLED: { label: 'ANULOWANY',    background: '#f1f5f9', color: '#475569' },
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDateLabel(value: string): string {
  if (!DATE_REGEX.test(value)) {
    return value;
  }
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

function leaveTypeLabel(value: LeaveRequest['leaveType']): string {
  const found = LEAVE_TYPES.find((item) => item.value === value);
  return found?.label ?? value;
}

function normalizeApiDate(value?: string): string {
  if (!value) {
    return '';
  }

  // API may return YYYY-MM-DD or full timestamp; keep date part for consistent UI.
  if (value.includes('T')) {
    return value.slice(0, 10);
  }

  return value;
}

function mapApiLeaveRequest(row: ApiLeaveRequest): LeaveRequest {
  const leaveType = row.leave_type ?? row.leaveType ?? 'ANNUAL';
  const startDate = normalizeApiDate(row.start_date ?? row.startDate);
  const endDate = normalizeApiDate(row.end_date ?? row.endDate);

  return {
    id: row.id,
    leaveType,
    startDate,
    endDate,
    reason: row.reason ?? null,
    status: row.status,
    managerComment: row.manager_comment ?? null,
  };
}

const CLOUD_API_URL = (
  process.env.EXPO_PUBLIC_API_URL_CLOUD ??
  process.env.EXPO_PUBLIC_API_URL ??
  'https://urlopy-api-svvhqvitka-lm.a.run.app'
).replace(/\/+$/, '');

// Powiadomienia systemowe pokazuj sie nawet gdy aplikacja jest zamknieta (FCM).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  const [password, setPassword] = useState('12345678');
  const [loginUsers, setLoginUsers] = useState<UserPickItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSentHistory, setShowSentHistory] = useState(false);
  const [showApprovedHistory, setShowApprovedHistory] = useState(false);
  const [leaveType, setLeaveType] = useState<(typeof LEAVE_TYPES)[number]['value']>('ANNUAL');
  const [startDate, setStartDate] = useState(toIsoDate(new Date()));
  const [endDate, setEndDate] = useState(toIsoDate(new Date()));
  const [reason, setReason] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('requests');
  const [workTrips, setWorkTrips] = useState<WorkTrip[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [leaveLimit, setLeaveLimit] = useState<LeaveLimit | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingItem[]>([]);
  const [tripDate, setTripDate] = useState(toIsoDate(new Date()));
  const [tripStartTime, setTripStartTime] = useState('08:00');
  const [tripEndTime, setTripEndTime] = useState('16:00');
  const [tripDestination, setTripDestination] = useState('');
  const [tripDescription, setTripDescription] = useState('');
  const [tripBusy, setTripBusy] = useState(false);
  const [decisionComment, setDecisionComment] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [adminSubTab, setAdminSubTab] = useState<AdminSubTab>('all-requests');
  const [allLimits, setAllLimits] = useState<EmployeeLeaveSummary[]>([]);
  const [allTrips, setAllTrips] = useState<WorkTripAdmin[]>([]);
  const [allUsersList, setAllUsersList] = useState<UserPickItem[]>([]);
  const [editLimitUserId, setEditLimitUserId] = useState('');
  const [editLimitDays, setEditLimitDays] = useState('26');
  const [limitBusy, setLimitBusy] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'EMPLOYEE' | 'ADMIN'>('EMPLOYEE');
  const [newUserBusy, setNewUserBusy] = useState(false);

  const apiUrl = CLOUD_API_URL;

  const sentRequests = useMemo(() => requests, [requests]);
  const approvedRequests = useMemo(
    () => requests.filter((request) => request.status === 'APPROVED'),
    [requests],
  );

  const approvedHistoryStats = useMemo(() => {
    const counts: Record<LeaveRequest['leaveType'], number> = {
      ANNUAL: 0,
      ON_DEMAND: 0,
      SICK: 0,
      UNPAID: 0,
      OTHER: 0,
    };

    for (const request of approvedRequests) {
      counts[request.leaveType] += 1;
    }

    return {
      total: approvedRequests.length,
      counts,
    };
  }, [approvedRequests]);

  const requestsTitle = 'Moje wnioski';

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    setRequests([]);
    setWorkTrips([]);
    setNotifications([]);
    setLeaveLimit(null);
    setPendingRequests([]);
    setAllLimits([]);
    setAllTrips([]);
    setAllUsersList([]);
    setSelectedUserId(null);
    setActiveTab('requests');
    setAdminSubTab('all-requests');
  }, []);

  async function login() {
    const selectedUser = loginUsers.find((u) => u.id === selectedUserId);
    if (!selectedUser) {
      setError('Wybierz uzytkownika z listy.');
      return;
    }
    setBusy(true);
    setError('');

    try {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: selectedUser.email, password }),
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
      void registerPushToken(data.accessToken);
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
      setError('Nie udalo sie pobrac listy wnioskow.');
      return;
    }

    const rows = (await res.json()) as ApiLeaveRequest[];
    setRequests(rows.map(mapApiLeaveRequest));
  }, [apiUrl, authFetch, user]);

  const loadLeaveLimit = useCallback(async () => {
    if (!user) return;
    const res = await authFetch(`${apiUrl}/leave-limits/mine`);
    if (!res || !res.ok) return;
    const data = (await res.json()) as LeaveLimit;
    setLeaveLimit(data);
  }, [apiUrl, authFetch, user]);

  const loadWorkTrips = useCallback(async () => {
    if (!user) return;
    const res = await authFetch(`${apiUrl}/work-trips/mine`);
    if (!res || !res.ok) return;
    const data = (await res.json()) as WorkTrip[];
    setWorkTrips(data);
  }, [apiUrl, authFetch, user]);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const res = await authFetch(`${apiUrl}/notifications/mine`);
    if (!res || !res.ok) return;
    const data = (await res.json()) as AppNotification[];
    setNotifications(data);
  }, [apiUrl, authFetch, user]);

  const loadPending = useCallback(async () => {
    if (!user || user.role !== 'ADMIN') return;
    const res = await authFetch(`${apiUrl}/leave-requests/pending`);
    if (!res || !res.ok) return;
    const data = (await res.json()) as PendingItem[];
    setPendingRequests(data);
  }, [apiUrl, authFetch, user]);

  const loadLoginUsers = useCallback(async () => {
    setLoginLoading(true);
    try {
      const res = await fetch(`${apiUrl}/auth/login-list`);
      if (res.ok) {
        setLoginUsers((await res.json()) as UserPickItem[]);
      } else {
        setLoginUsers(DEFAULT_LOGIN_USERS);
        setError('');
      }
    } catch {
      setLoginUsers(DEFAULT_LOGIN_USERS);
      setError('');
    }
    finally { setLoginLoading(false); }
  }, [apiUrl]);

  const loadAllUsers = useCallback(async () => {
    const res = await authFetch(`${apiUrl}/auth/users`);
    if (!res || !res.ok) return;
    setAllUsersList((await res.json()) as UserPickItem[]);
  }, [apiUrl, authFetch]);

  const loadAllLimits = useCallback(async () => {
    const res = await authFetch(`${apiUrl}/leave-limits`);
    if (!res || !res.ok) return;
    setAllLimits((await res.json()) as EmployeeLeaveSummary[]);
  }, [apiUrl, authFetch]);

  const loadAllTrips = useCallback(async () => {
    const res = await authFetch(`${apiUrl}/work-trips/all`);
    if (!res || !res.ok) return;
    setAllTrips((await res.json()) as WorkTripAdmin[]);
  }, [apiUrl, authFetch]);

  const setLimitForUser = useCallback(async () => {
    const uid = Number(editLimitUserId);
    const days = Number(editLimitDays);
    if (!uid || Number.isNaN(days) || days < 0) { setError('Nieprawidlowe dane limitu.'); return; }
    setLimitBusy(true);
    const res = await authFetch(`${apiUrl}/leave-limits/${uid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annualDays: days }),
    });
    setLimitBusy(false);
    if (!res || !res.ok) { setError('Blad zapisu limitu.'); return; }
    await loadAllLimits();
  }, [apiUrl, authFetch, editLimitUserId, editLimitDays, loadAllLimits]);

  const createNewUser = useCallback(async () => {
    if (!newUserName.trim() || !newUserEmail.trim()) { setError('Podaj imie i email.'); return; }
    setNewUserBusy(true);
    const res = await authFetch(`${apiUrl}/auth/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newUserName.trim(), email: newUserEmail.trim(), password: '12345678', role: newUserRole }),
    });
    setNewUserBusy(false);
    if (!res || !res.ok) { setError('Blad tworzenia uzytkownika.'); return; }
    setNewUserName('');
    setNewUserEmail('');
    await loadAllUsers();
    await loadLoginUsers();
  }, [apiUrl, authFetch, newUserName, newUserEmail, newUserRole, loadAllUsers, loadLoginUsers]);

  const cancelRequest = useCallback(async (requestId: number) => {
    const res = await authFetch(`${apiUrl}/leave-requests/${requestId}`, { method: 'DELETE' });
    if (!res) return;
    if (!res.ok) {
      setError('Nie udalo sie anulowac wniosku.');
      return;
    }
    await loadMyRequests();

  }, [apiUrl, authFetch, loadMyRequests]);

  const notifListenerRef = useRef<ReturnType<typeof Notifications.addNotificationReceivedListener> | null>(null);

  const registerPushToken = useCallback(async (accessToken: string): Promise<void> => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      const { data: fcmToken } = await Notifications.getDevicePushTokenAsync();
      await fetch(`${apiUrl}/auth/device-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ token: fcmToken }),
      });
    } catch { /* ignoruj bledy push registration */ }
  }, [apiUrl]);

  const decideRequest = useCallback(async (requestId: number, decision: 'APPROVED' | 'REJECTED') => {
    setDecisionBusy(true);
    setError('');
    const res = await authFetch(`${apiUrl}/leave-requests/${requestId}/decision`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, comment: decisionComment.trim() || undefined }),
    });
    if (!res) { setDecisionBusy(false); return; }
    if (!res.ok) {
      setError('Nie udalo sie podjac decyzji.');
      setDecisionBusy(false);
      return;
    }
    setDecisionComment('');
    await loadPending();
    setDecisionBusy(false);
  }, [apiUrl, authFetch, decisionComment, loadPending]);

  const submitWorkTrip = useCallback(async () => {
    if (!user) return;
    setTripBusy(true);
    setError('');
    const res = await authFetch(`${apiUrl}/work-trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripDate,
        startTime: tripStartTime,
        endTime: tripEndTime,
        destination: tripDestination.trim() || undefined,
        description: tripDescription.trim() || undefined,
      }),
    });
    if (!res) { setTripBusy(false); return; }
    if (!res.ok) {
      let msg = 'Nie udalo sie zapisac wyjazdu.';
      try {
        const p = (await res.json()) as { message?: string | string[] };
        if (typeof p.message === 'string') msg = p.message;
        else if (Array.isArray(p.message)) msg = p.message.join(' ');
      } catch { /* ignore */ }
      setError(msg);
      setTripBusy(false);
      return;
    }
    setTripDestination('');
    setTripDescription('');
    await loadWorkTrips();
    setTripBusy(false);
  }, [apiUrl, authFetch, user, tripDate, tripStartTime, tripEndTime, tripDestination, tripDescription, loadWorkTrips]);

  async function submitRequest() {
    if (!user || user.role !== 'EMPLOYEE') {
      return;
    }

    setError('');

    if (!DATE_REGEX.test(startDate) || !DATE_REGEX.test(endDate)) {
      setError('Nieprawidłowy format daty.');
      return;
    }

    setSubmitBusy(true);
    const res = await authFetch(`${apiUrl}/leave-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaveType,
        startDate,
        endDate,
        reason: reason.trim() ? reason.trim() : undefined,
      }),
    });

    if (!res) {
      setSubmitBusy(false);
      return;
    }

    if (!res.ok) {
      let message = 'Nie udało się wysłać wniosku.';
      try {
        const payload = (await res.json()) as { message?: string | string[] };
        if (Array.isArray(payload.message)) {
          message = payload.message.join(' ');
        } else if (typeof payload.message === 'string' && payload.message) {
          message = payload.message;
        }
      } catch {
        // Ignorujemy, zostaje domyslny komunikat.
      }

      setError(message);
      setSubmitBusy(false);
      return;
    }

      setStartDate(toIsoDate(new Date()));
      setEndDate(toIsoDate(new Date()));
    setReason('');
    await loadMyRequests();
    setSubmitBusy(false);
  }

  function openDatePicker(field: 'start' | 'end' | 'tripDate') {
    const current = field === 'start' ? startDate : field === 'end' ? endDate : tripDate;
    DateTimePickerAndroid.open({
      value: fromIsoDate(current),
      mode: 'date',
      is24Hour: true,
      onChange: (_, pickedDate) => {
        if (!pickedDate) {
          return;
        }

        const nextIso = toIsoDate(pickedDate);
        if (field === 'tripDate') {
          setTripDate(nextIso);
          return;
        }
        if (field === 'start') {
          setStartDate(nextIso);
          if (new Date(endDate).getTime() < pickedDate.getTime()) {
            setEndDate(nextIso);
          }
          return;
        }

        if (new Date(nextIso).getTime() < new Date(startDate).getTime()) {
          setError('Data zakończenia nie może być wcześniejsza od daty rozpoczęcia.');
          return;
        }

        setEndDate(nextIso);
      },
    });
  }

  function openTimePicker(field: 'start' | 'end') {
    const currentVal = field === 'start' ? tripStartTime : tripEndTime;
    const [h, m] = currentVal.split(':').map(Number);
    const base = new Date();
    base.setHours(h ?? 8, m ?? 0, 0, 0);
    DateTimePickerAndroid.open({
      value: base,
      mode: 'time',
      is24Hour: true,
      onChange: (_, pickedDate) => {
        if (!pickedDate) return;
        const hh = String(pickedDate.getHours()).padStart(2, '0');
        const mm = String(pickedDate.getMinutes()).padStart(2, '0');
        if (field === 'start') setTripStartTime(`${hh}:${mm}`);
        else setTripEndTime(`${hh}:${mm}`);
      },
    });
  }

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

  useEffect(() => {
    void loadLoginUsers();
  }, [loadLoginUsers]);

  useEffect(() => {
    if (!user) {
      return;
    }

    void loadMyRequests();
    void loadWorkTrips();
    void loadNotifications();
    void loadLeaveLimit();
    if (user.role === 'ADMIN') {
      void loadPending();
    }
    if (user.role === 'ADMIN') {
      void loadAllUsers();
      void loadAllLimits();
      void loadAllTrips();
    }
  }, [loadMyRequests, loadWorkTrips, loadNotifications, loadLeaveLimit, loadPending, loadAllUsers, loadAllLimits, loadAllTrips, user]);

  useEffect(() => {
    // Odbierz powiadomienie gdy aplikacja jest na pierwszym planie
    notifListenerRef.current = Notifications.addNotificationReceivedListener(() => {
      void loadNotifications();
    });
    // Kliknięcie w powiadomienie otwiera zakładkę powiadomień
    const tapSub = Notifications.addNotificationResponseReceivedListener(() => {
      setActiveTab('notifications');
    });
    return () => {
      notifListenerRef.current?.remove();
      tapSub.remove();
    };
  }, [loadNotifications]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.card}>
        <Text style={styles.title}>Urlopy Camino</Text>

        {!user && (
          <>
            <Text style={styles.caption}>Wybierz uzytkownika</Text>
            {loginLoading ? (
              <ActivityIndicator color="#0f172a" style={{ marginVertical: 12 }} />
            ) : loginUsers.length === 0 ? (
              <TouchableOpacity style={[styles.ghostButton, { marginBottom: 8 }]} onPress={() => void loadLoginUsers()}>
                <Text style={styles.ghostButtonText}>Pobierz liste uzytkownikow</Text>
              </TouchableOpacity>
            ) : null}
            <ScrollView style={styles.userPickList} keyboardShouldPersistTaps="handled">
              {loginUsers.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.userPickRow, selectedUserId === u.id ? styles.userPickRowSelected : null]}
                  onPress={() => setSelectedUserId(u.id)}
                >
                  <View>
                    <Text style={[styles.userPickName, selectedUserId === u.id ? styles.userPickNameSelected : null]}>
                      {u.name}
                    </Text>
                    <Text style={styles.userPickRole}>{u.role}</Text>
                  </View>
                  {selectedUserId === u.id ? <Text style={styles.userPickCheck}>✓</Text> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Haslo"
              placeholderTextColor="#64748b"
              keyboardAppearance="light"
              selectionColor="#0f172a"
              secureTextEntry
            />
            <TouchableOpacity
              style={[styles.button, (!selectedUserId || busy) ? styles.buttonDisabled : null]}
              onPress={() => void login()}
              disabled={!selectedUserId || busy}
            >
              <Text style={styles.buttonText}>Zaloguj</Text>
            </TouchableOpacity>
          </>
        )}

        {user && (
          <>
            <View style={styles.logoutRow}>
              <Text style={styles.userName} numberOfLines={1}>{user.name}</Text>
              <TouchableOpacity style={styles.ghostButton} onPress={() => void logoutCurrentSession()}>
                <Text style={styles.ghostButtonText}>Wyloguj</Text>
              </TouchableOpacity>
            </View>

            {user.role === 'EMPLOYEE' && leaveLimit !== null && (
              <View style={styles.limitBanner}>
                <Text style={styles.limitBannerText}>
                  Pozostalo dni urlopu: {leaveLimit.remainingDays} / {leaveLimit.annualDays} (rok {leaveLimit.year})
                </Text>
              </View>
            )}

            <View style={styles.tabBar}>
              {(['requests', 'trips', 'notifications'] as ActiveTab[]).map((tab) => {
                const labels: Record<string, string> = {
                  requests: 'Wnioski',
                  trips: 'Wyjazdy',
                  notifications: notifications.length > 0 ? `Powiad. (${notifications.length})` : 'Powiadomienia',
                };
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.tabButton, activeTab === tab ? styles.tabButtonActive : null]}
                    onPress={() => setActiveTab(tab)}
                  >
                    <Text style={[styles.tabButtonText, activeTab === tab ? styles.tabButtonTextActive : null]}>
                      {labels[tab]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {user.role === 'ADMIN' && (
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'admin' ? styles.tabButtonActive : null]}
                  onPress={() => setActiveTab('admin')}
                >
                  <Text style={[styles.tabButtonText, activeTab === 'admin' ? styles.tabButtonTextActive : null]}>
                    Admin
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">

              {/* ======= TAB: WNIOSKI ======= */}
              {activeTab === 'requests' && (
                <>
                  {user.role === 'EMPLOYEE' && (
                    <View style={styles.formCard}>
                      <Text style={styles.subtitle}>Nowy wniosek do szefa</Text>
                      <Text style={styles.caption}>Typ urlopu</Text>
                      <View style={styles.typeRow}>
                        {LEAVE_TYPES.map((option) => (
                          <TouchableOpacity
                            key={option.value}
                            style={[styles.typeButton, leaveType === option.value ? styles.typeButtonActive : null]}
                            onPress={() => setLeaveType(option.value)}
                          >
                            <Text style={[styles.typeButtonText, leaveType === option.value ? styles.typeButtonTextActive : null]}>
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Text style={styles.caption}>Data rozpoczecia</Text>
                      <TouchableOpacity style={styles.dateButton} onPress={() => openDatePicker('start')}>
                        <Text style={styles.dateButtonText}>{formatDateLabel(startDate)}</Text>
                      </TouchableOpacity>
                      <Text style={styles.caption}>Data zakonczenia</Text>
                      <TouchableOpacity style={styles.dateButton} onPress={() => openDatePicker('end')}>
                        <Text style={styles.dateButtonText}>{formatDateLabel(endDate)}</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={[styles.input, styles.textArea]}
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Notatka do szefa (opcjonalnie)"
                        placeholderTextColor="#64748b"
                        autoCorrect={false}
                        keyboardAppearance="light"
                        selectionColor="#0f172a"
                        multiline
                      />
                      <TouchableOpacity
                        style={[styles.button, submitBusy ? styles.buttonDisabled : null]}
                        onPress={() => void submitRequest()}
                        disabled={submitBusy}
                      >
                        <Text style={styles.buttonText}>Wyslij do szefa</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <View style={styles.listHeaderRow}>
                    <Text style={styles.subtitle}>{requestsTitle}</Text>
                    <View style={styles.listActionsRow}>
                      <TouchableOpacity style={styles.ghostButton} onPress={() => setShowSentHistory((p) => !p)}>
                        <Text style={styles.ghostButtonText}>{showSentHistory ? 'Ukryj wyslane' : 'Wyslane'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.ghostButton} onPress={() => setShowApprovedHistory((p) => !p)}>
                        <Text style={styles.ghostButtonText}>{showApprovedHistory ? 'Ukryj zatwierdzone' : 'Zatwierdzone'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.ghostButton} onPress={() => void loadMyRequests()}>
                        <Text style={styles.ghostButtonText}>Odswiez</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {showSentHistory && (
                    <View style={styles.historyCard}>
                      <Text style={styles.subtitle}>Historia wyslanych wnioskow</Text>
                      <Text style={styles.row}>Lacznie wyslanych: {sentRequests.length}</Text>
                      <Text style={styles.hint}>Dane z bazy CLOUD API.</Text>
                      {sentRequests.length === 0 ? <Text style={styles.row}>Brak wyslanych wnioskow.</Text> : null}
                      {sentRequests.map((item) => (
                        <View key={`sh-${item.id}`} style={styles.historyItem}>
                          <Text style={styles.row}>
                            #{item.id} | {formatDateLabel(item.startDate)} - {formatDateLabel(item.endDate)} |{' '}
                            {leaveTypeLabel(item.leaveType)} | {STATUS_META[item.status]?.label ?? item.status}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {showApprovedHistory && (
                    <View style={styles.historyCard}>
                      <Text style={styles.subtitle}>Historia zatwierdzonych wnioskow</Text>
                      <Text style={styles.row}>Lacznie zatwierdzonych: {approvedHistoryStats.total}</Text>
                      <Text style={styles.hint}>Dane z bazy CLOUD API.</Text>
                      <View style={styles.counterGrid}>
                        {LEAVE_TYPES.map((type) => (
                          <View key={type.value} style={styles.counterItem}>
                            <Text style={styles.counterLabel}>{type.label}</Text>
                            <Text style={styles.counterValue}>{approvedHistoryStats.counts[type.value]}</Text>
                          </View>
                        ))}
                      </View>
                      {approvedRequests.length === 0 ? <Text style={styles.row}>Brak zatwierdzonych wnioskow.</Text> : null}
                      {approvedRequests.map((item) => (
                        <View key={`ah-${item.id}`} style={styles.historyItem}>
                          <Text style={styles.row}>
                            #{item.id} | {formatDateLabel(item.startDate)} - {formatDateLabel(item.endDate)} |{' '}
                            {leaveTypeLabel(item.leaveType)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {requests.length === 0 ? <Text style={styles.row}>Brak wnioskow.</Text> : null}
                  {requests.map((item) => (
                    <View key={item.id} style={styles.requestCard}>
                      <View style={[styles.statusBadge, { backgroundColor: STATUS_META[item.status]?.background ?? '#f1f5f9' }]}>
                        <Text style={[styles.statusBadgeText, { color: STATUS_META[item.status]?.color ?? '#334155' }]}>
                          {STATUS_META[item.status]?.label ?? item.status}
                        </Text>
                      </View>
                      <Text style={styles.row}>
                        #{item.id} {leaveTypeLabel(item.leaveType)} {formatDateLabel(item.startDate)} -{' '}
                        {formatDateLabel(item.endDate)}
                      </Text>
                      <Text style={styles.row}>Notatka: {item.reason || '-'}</Text>
                      {item.managerComment ? (
                        <Text style={styles.managerCommentText}>Komentarz administratora: {item.managerComment}</Text>
                      ) : null}
                      {item.status === 'PENDING' && user.role === 'EMPLOYEE' && (
                        <TouchableOpacity style={styles.cancelButton} onPress={() => void cancelRequest(item.id)}>
                          <Text style={styles.cancelButtonText}>Anuluj wniosek</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </>
              )}

              {/* ======= TAB: WYJAZDY ======= */}
              {activeTab === 'trips' && (
                <>
                  <View style={styles.formCard}>
                    <Text style={styles.subtitle}>Nowy wyjazd sluzbowy</Text>
                    <Text style={styles.caption}>Data wyjazdu</Text>
                    <TouchableOpacity style={styles.dateButton} onPress={() => openDatePicker('tripDate')}>
                      <Text style={styles.dateButtonText}>{formatDateLabel(tripDate)}</Text>
                    </TouchableOpacity>
                    <Text style={styles.caption}>Godzina rozpoczecia</Text>
                    <TouchableOpacity style={styles.dateButton} onPress={() => openTimePicker('start')}>
                      <Text style={styles.dateButtonText}>{tripStartTime}</Text>
                    </TouchableOpacity>
                    <Text style={styles.caption}>Godzina zakonczenia</Text>
                    <TouchableOpacity style={styles.dateButton} onPress={() => openTimePicker('end')}>
                      <Text style={styles.dateButtonText}>{tripEndTime}</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.input}
                      value={tripDestination}
                      onChangeText={setTripDestination}
                      placeholder="Miejsce docelowe"
                      placeholderTextColor="#64748b"
                      autoCorrect={false}
                      keyboardAppearance="light"
                      selectionColor="#0f172a"
                    />
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={tripDescription}
                      onChangeText={setTripDescription}
                      placeholder="Opis wyjazdu (opcjonalnie)"
                      placeholderTextColor="#64748b"
                      autoCorrect={false}
                      keyboardAppearance="light"
                      selectionColor="#0f172a"
                      multiline
                    />
                    <TouchableOpacity
                      style={[styles.button, tripBusy ? styles.buttonDisabled : null]}
                      onPress={() => void submitWorkTrip()}
                      disabled={tripBusy}
                    >
                      <Text style={styles.buttonText}>Zapisz wyjazd</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.listHeaderRow}>
                    <Text style={styles.subtitle}>Historia wyjazdow ({workTrips.length})</Text>
                    <TouchableOpacity style={styles.ghostButton} onPress={() => void loadWorkTrips()}>
                      <Text style={styles.ghostButtonText}>Odswiez</Text>
                    </TouchableOpacity>
                  </View>
                  {workTrips.length === 0 ? <Text style={styles.row}>Brak zapisanych wyjazdow.</Text> : null}
                  {workTrips.map((trip) => (
                    <View key={trip.id} style={styles.requestCard}>
                      <Text style={styles.row}>
                        {formatDateLabel(trip.trip_date)} | {trip.start_time.slice(0, 5)} - {trip.end_time.slice(0, 5)}
                      </Text>
                      {trip.destination ? <Text style={styles.row}>Miejsce: {trip.destination}</Text> : null}
                      {trip.description ? <Text style={styles.row}>Opis: {trip.description}</Text> : null}
                    </View>
                  ))}
                </>
              )}

              {/* ======= TAB: POWIADOMIENIA ======= */}
              {activeTab === 'notifications' && (
                <>
                  <View style={styles.listHeaderRow}>
                    <Text style={styles.subtitle}>Powiadomienia ({notifications.length})</Text>
                    <TouchableOpacity style={styles.ghostButton} onPress={() => void loadNotifications()}>
                      <Text style={styles.ghostButtonText}>Odswiez</Text>
                    </TouchableOpacity>
                  </View>
                  {notifications.length === 0 ? <Text style={styles.row}>Brak powiadomien.</Text> : null}
                  {notifications.map((notif) => (
                    <View key={notif.id} style={styles.requestCard}>
                      <Text style={styles.row}>{notif.message}</Text>
                      <Text style={styles.hint}>
                        {notif.created_at ? notif.created_at.slice(0, 16).replace('T', ' ') : ''}
                      </Text>
                    </View>
                  ))}
                </>
              )}

              {/* ======= TAB: SZEF ======= */}
              {/* ======= TAB: ADMIN ======= */}
              {activeTab === 'admin' && user.role === 'ADMIN' && (
                <>
                  <View style={styles.tabBar}>
                    {(['all-requests', 'all-limits', 'all-trips', 'all-users'] as AdminSubTab[]).map((sub) => {
                      const subLabels: Record<AdminSubTab, string> = {
                        'all-requests': 'Wnioski',
                        'all-limits': 'Limity',
                        'all-trips': 'Wyjazdy',
                        'all-users': 'Uzytkownicy',
                      };
                      return (
                        <TouchableOpacity
                          key={sub}
                          style={[styles.tabButton, adminSubTab === sub ? styles.tabButtonActive : null]}
                          onPress={() => setAdminSubTab(sub)}
                        >
                          <Text style={[styles.tabButtonText, adminSubTab === sub ? styles.tabButtonTextActive : null]}>
                            {subLabels[sub]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {adminSubTab === 'all-requests' && (
                    <>
                      <View style={styles.listHeaderRow}>
                        <Text style={styles.subtitle}>Wnioski oczekujace ({pendingRequests.length})</Text>
                        <TouchableOpacity style={styles.ghostButton} onPress={() => void loadPending()}>
                          <Text style={styles.ghostButtonText}>Odswiez</Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        style={styles.input}
                        value={decisionComment}
                        onChangeText={setDecisionComment}
                        placeholder="Komentarz do decyzji"
                        placeholderTextColor="#64748b"
                        selectionColor="#0f172a"
                      />
                      {pendingRequests.length === 0 ? <Text style={styles.row}>Brak oczekujacych wnioskow.</Text> : null}
                      {pendingRequests.map((item) => (
                        <View key={`adm-req-${item.id}`} style={styles.requestCard}>
                          <Text style={styles.row}>#{item.id} | {item.leave_type} | {item.start_date?.slice(0, 10)} - {item.end_date?.slice(0, 10)}</Text>
                          <Text style={styles.row}>Pracownik ID: {item.user_id}</Text>
                          {item.reason ? <Text style={styles.row}>Powod: {item.reason}</Text> : null}
                          <View style={styles.decisionRow}>
                            <TouchableOpacity style={[styles.approveButton, decisionBusy ? styles.buttonDisabled : null]}
                              disabled={decisionBusy} onPress={() => void decideRequest(item.id, 'APPROVED')}>
                              <Text style={styles.buttonText}>Akceptuj</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.rejectButton, decisionBusy ? styles.buttonDisabled : null]}
                              disabled={decisionBusy} onPress={() => void decideRequest(item.id, 'REJECTED')}>
                              <Text style={styles.buttonText}>Odrzuc</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </>
                  )}

                  {adminSubTab === 'all-limits' && (
                    <>
                      <View style={styles.listHeaderRow}>
                        <Text style={styles.subtitle}>Limity urlopowe ({allLimits.length})</Text>
                        <TouchableOpacity style={styles.ghostButton} onPress={() => void loadAllLimits()}>
                          <Text style={styles.ghostButtonText}>Odswiez</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.formCard}>
                        <Text style={styles.caption}>Ustaw limit urlopu</Text>
                        <TextInput style={styles.input} value={editLimitUserId} onChangeText={setEditLimitUserId}
                          placeholder="ID pracownika" placeholderTextColor="#64748b" keyboardType="numeric" selectionColor="#0f172a" />
                        <TextInput style={styles.input} value={editLimitDays} onChangeText={setEditLimitDays}
                          placeholder="Liczba dni (np. 26)" placeholderTextColor="#64748b" keyboardType="numeric" selectionColor="#0f172a" />
                        <TouchableOpacity style={[styles.button, limitBusy ? styles.buttonDisabled : null]}
                          disabled={limitBusy} onPress={() => void setLimitForUser()}>
                          <Text style={styles.buttonText}>Zapisz limit</Text>
                        </TouchableOpacity>
                      </View>
                      {allLimits.length === 0 ? <Text style={styles.row}>Brak danych. Nacisnij Odswiez.</Text> : null}
                      {allLimits.map((lim) => (
                        <View key={`lim-${lim.userId}`} style={styles.requestCard}>
                          <Text style={styles.row}>{lim.name} (ID: {lim.userId})</Text>
                          <Text style={styles.row}>Rok {lim.year} | Limit: {lim.annualDays} | Wykorz.: {lim.usedDays} | Pozostalo: {lim.remainingDays}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  {adminSubTab === 'all-trips' && (
                    <>
                      <View style={styles.listHeaderRow}>
                        <Text style={styles.subtitle}>Godziny wyjazdowe ({allTrips.length})</Text>
                        <TouchableOpacity style={styles.ghostButton} onPress={() => void loadAllTrips()}>
                          <Text style={styles.ghostButtonText}>Odswiez</Text>
                        </TouchableOpacity>
                      </View>
                      {allTrips.length === 0 ? <Text style={styles.row}>Brak danych. Nacisnij Odswiez.</Text> : null}
                      {allTrips.map((trip) => (
                        <View key={`atrip-${trip.id}`} style={styles.requestCard}>
                          <Text style={styles.row}>
                            {trip.user_name ?? `ID ${trip.user_id}`} | {trip.trip_date?.slice(0, 10)} | {trip.start_time?.slice(0, 5)} - {trip.end_time?.slice(0, 5)}
                          </Text>
                          {trip.destination ? <Text style={styles.row}>Miejsce: {trip.destination}</Text> : null}
                          {trip.description ? <Text style={styles.row}>Opis: {trip.description}</Text> : null}
                        </View>
                      ))}
                    </>
                  )}

                  {adminSubTab === 'all-users' && (
                    <>
                      <View style={styles.listHeaderRow}>
                        <Text style={styles.subtitle}>Uzytkownicy ({allUsersList.length})</Text>
                        <TouchableOpacity style={styles.ghostButton} onPress={() => void loadAllUsers()}>
                          <Text style={styles.ghostButtonText}>Odswiez</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.formCard}>
                        <Text style={styles.caption}>Dodaj uzytkownika (haslo: 12345678)</Text>
                        <TextInput style={styles.input} value={newUserName} onChangeText={setNewUserName}
                          placeholder="Imie i nazwisko" placeholderTextColor="#64748b" selectionColor="#0f172a" />
                        <TextInput style={styles.input} value={newUserEmail} onChangeText={setNewUserEmail}
                          placeholder="Email" placeholderTextColor="#64748b" autoCapitalize="none" selectionColor="#0f172a" />
                        <View style={styles.typeRow}>
                          {(['EMPLOYEE', 'ADMIN'] as const).map((r) => (
                            <TouchableOpacity key={r}
                              style={[styles.typeButton, newUserRole === r ? styles.typeButtonActive : null]}
                              onPress={() => setNewUserRole(r)}>
                              <Text style={[styles.typeButtonText, newUserRole === r ? styles.typeButtonTextActive : null]}>{r}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <TouchableOpacity style={[styles.button, newUserBusy ? styles.buttonDisabled : null]}
                          disabled={newUserBusy} onPress={() => void createNewUser()}>
                          <Text style={styles.buttonText}>Dodaj uzytkownika</Text>
                        </TouchableOpacity>
                      </View>
                      {allUsersList.map((u) => (
                        <View key={`usr-${u.id}`} style={styles.requestCard}>
                          <Text style={styles.row}>{u.name} — {u.role}</Text>
                          <Text style={styles.hint}>{u.email}</Text>
                        </View>
                      ))}
                    </>
                  )}
                </>
              )}

            </ScrollView>
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
    gap: 8,
    marginBottom: 8,
  },
  formCard: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  caption: {
    color: '#334155',
    marginBottom: 6,
    fontWeight: '600',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  typeButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  typeButtonActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  typeButtonText: {
    color: '#0f172a',
    fontWeight: '600',
  },
  typeButtonTextActive: {
    color: '#ffffff',
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  dateButtonText: {
    color: '#0f172a',
    fontWeight: '600',
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  historyCard: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#f8fafc',
  },
  counterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 8,
  },
  counterItem: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 95,
    backgroundColor: '#ffffff',
  },
  counterLabel: {
    color: '#475569',
    fontSize: 12,
  },
  counterValue: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 18,
  },
  historyItem: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 6,
    marginTop: 6,
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
  buttonDisabled: {
    opacity: 0.7,
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
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
  },
  statusBadgeText: {
    fontWeight: '700',
    fontSize: 12,
  },
  error: {
    marginTop: 8,
    color: '#be123c',
  },
  userPickList: {
    maxHeight: 260,
    marginBottom: 6,
  },
  userPickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 5,
    backgroundColor: '#f8fafc',
  },
  userPickRowSelected: {
    borderColor: '#0f172a',
    backgroundColor: '#eff6ff',
  },
  userPickName: {
    fontWeight: '600',
    color: '#1e293b',
    fontSize: 15,
  },
  userPickNameSelected: {
    color: '#1d4ed8',
  },
  userPickRole: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  userPickCheck: {
    color: '#1d4ed8',
    fontWeight: '800',
    fontSize: 18,
  },
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
    marginTop: 2,
  },
  tabButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  tabButtonActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  tabButtonText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#ffffff',
  },
  limitBanner: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  limitBannerText: {
    color: '#166534',
    fontWeight: '600',
    fontSize: 13,
  },
  userName: {
    flex: 1,
    fontWeight: '700',
    color: '#0f172a',
    fontSize: 14,
    marginRight: 8,
    alignSelf: 'center',
  },
  managerCommentText: {
    color: '#0369a1',
    marginBottom: 6,
    fontStyle: 'italic',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 7,
    marginTop: 6,
    backgroundColor: '#fef2f2',
  },
  cancelButtonText: {
    color: '#b91c1c',
    fontWeight: '600',
  },
  decisionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  approveButton: {
    flex: 1,
    backgroundColor: '#166534',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#b91c1c',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },
});

import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import EventSource from 'react-native-sse';
import {
  ActivityIndicator,
  AppState,
  Platform,
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
  updatedAt?: string;
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
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ADJUSTED';
  manager_comment?: string | null;
  decision_at?: string | null;
  created_at: string;
};

type AppNotification = {
  id: number;
  event: string;
  message: string;
  status: string;
  created_at: string;
};

type ApiNotification = {
  id: number;
  event: string;
  message: string;
  status: string;
  created_at?: string;
  createdAt?: string;
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
  user_name?: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  manager_comment: string | null;
};

type AdminLeaveRequest = PendingItem & {
  created_at?: string;
  updated_at?: string;
  decision_at?: string | null;
};

type CalendarDayDetails = {
  pendingUsers: string[];
  approvedUsers: string[];
};

type ActiveTab = 'requests' | 'trips' | 'notifications' | 'admin' | 'calendar';
type AdminSubTab = 'all-requests' | 'all-limits' | 'all-trips' | 'all-users';
type HistoryRange = 'ALL' | 'MONTH' | 'YEAR';
type AdminRequestStatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
type UserPickItem = { id: number; name: string; role: string; email: string };
type EmployeeLeaveSummary = {
  userId: number; name: string; email: string;
  year: number; annualDays: number; usedDays: number; remainingDays: number;
};
type WorkTripAdmin = {
  id: number; user_id: number; user_name: string | null;
  trip_date: string; start_time: string; end_time: string;
  destination: string | null; description: string | null;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ADJUSTED';
  manager_comment?: string | null;
  decision_at?: string | null;
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
  updated_at?: string;
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
  ADJUSTED:  { label: 'SKORYGOWANY',  background: '#dbeafe', color: '#1d4ed8' },
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

function roleLabel(value: string): string {
  if (value === 'ADMIN') {
    return 'Administrator';
  }
  if (value === 'EMPLOYEE') {
    return 'Pracownik';
  }
  return value;
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

function parseIsoDateToUtc(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function daysInclusive(start: string, end: string): number {
  if (!DATE_REGEX.test(start) || !DATE_REGEX.test(end)) {
    return 0;
  }

  const ms = parseIsoDateToUtc(end).getTime() - parseIsoDateToUtc(start).getTime();
  if (ms < 0) {
    return 0;
  }

  return Math.floor(ms / 86400000) + 1;
}

function isInHistoryRange(dateIso: string, range: HistoryRange): boolean {
  if (!DATE_REGEX.test(dateIso)) {
    return range === 'ALL';
  }

  if (range === 'ALL') {
    return true;
  }

  const now = new Date();
  const [yearStr, monthStr] = dateIso.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (range === 'YEAR') {
    return year === now.getFullYear();
  }

  return year === now.getFullYear() && month === now.getMonth() + 1;
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
    updatedAt: row.updated_at,
    reason: row.reason ?? null,
    status: row.status,
    managerComment: row.manager_comment ?? null,
  };
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(base.getDate() + days);
  return next;
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('pl-PL', {
    month: 'long',
    year: 'numeric',
  });
}

const PROD_CLOUD_API_URL = 'https://urlopy-api-622924376884.europe-central2.run.app';

const CLOUD_API_URL = (
  process.env.EXPO_PUBLIC_API_URL_WEB ??
  process.env.EXPO_PUBLIC_API_URL_CLOUD ??
  process.env.EXPO_PUBLIC_API_URL ??
  PROD_CLOUD_API_URL
).replace(/\/+$/, '');

// Powiadomienia systemowe pokazuj sie nawet gdy aplikacja jest zamknieta (FCM).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
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
  const [requestEditId, setRequestEditId] = useState<number | null>(null);
  const [requestEditUpdatedAt, setRequestEditUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showSentHistory, setShowSentHistory] = useState(false);
  const [showApprovedHistory, setShowApprovedHistory] = useState(false);
  const [showRejectedHistory, setShowRejectedHistory] = useState(false);
  const [requestHistoryRange, setRequestHistoryRange] = useState<HistoryRange>('ALL');
  const [leaveType, setLeaveType] = useState<(typeof LEAVE_TYPES)[number]['value']>('ANNUAL');
  const [startDate, setStartDate] = useState(toIsoDate(new Date()));
  const [endDate, setEndDate] = useState(toIsoDate(new Date()));
  const [reason, setReason] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('requests');
  const [workTrips, setWorkTrips] = useState<WorkTrip[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [leaveLimit, setLeaveLimit] = useState<LeaveLimit | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingItem[]>([]);
  const [allAdminRequests, setAllAdminRequests] = useState<AdminLeaveRequest[]>([]);
  const [tripDate, setTripDate] = useState(toIsoDate(new Date()));
  const [tripStartTime, setTripStartTime] = useState('08:00');
  const [tripEndTime, setTripEndTime] = useState('16:00');
  const [tripDestination, setTripDestination] = useState('');
  const [tripDescription, setTripDescription] = useState('');
  const [tripBusy, setTripBusy] = useState(false);
  const [tripEditId, setTripEditId] = useState<number | null>(null);
  const [tripEditStartTime, setTripEditStartTime] = useState('08:00');
  const [tripEditEndTime, setTripEditEndTime] = useState('16:00');
  const [tripEditDestination, setTripEditDestination] = useState('');
  const [tripEditDescription, setTripEditDescription] = useState('');
  const [tripEditBusy, setTripEditBusy] = useState(false);
  const [tripHistoryRange, setTripHistoryRange] = useState<HistoryRange>('ALL');
  const [decisionComment, setDecisionComment] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [adminSubTab, setAdminSubTab] = useState<AdminSubTab>('all-requests');
  const [adminRequestHistoryRange, setAdminRequestHistoryRange] = useState<HistoryRange>('ALL');
  const [adminRequestStatusFilter, setAdminRequestStatusFilter] = useState<AdminRequestStatusFilter>('ALL');
  const [allLimits, setAllLimits] = useState<EmployeeLeaveSummary[]>([]);
  const [allTrips, setAllTrips] = useState<WorkTripAdmin[]>([]);
  const [allUsersList, setAllUsersList] = useState<UserPickItem[]>([]);
  const [editLimitUserId, setEditLimitUserId] = useState('');
  const [selectedLimitUserId, setSelectedLimitUserId] = useState<number | null>(null);
  const [editLimitDays, setEditLimitDays] = useState('26');
  const [limitBusy, setLimitBusy] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('12345678');
  const [newUserRole, setNewUserRole] = useState<'EMPLOYEE' | 'ADMIN'>('EMPLOYEE');
  const [newUserBusy, setNewUserBusy] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [adminTripReviewId, setAdminTripReviewId] = useState<number | null>(null);
  const [adminTripStartTime, setAdminTripStartTime] = useState('08:00');
  const [adminTripEndTime, setAdminTripEndTime] = useState('16:00');
  const [adminTripComment, setAdminTripComment] = useState('');
  const [adminTripBusy, setAdminTripBusy] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(toIsoDate(new Date()));

  const apiUrl = CLOUD_API_URL;

  const sentRequests = useMemo(() => requests, [requests]);
  const approvedRequests = useMemo(
    () => requests.filter((request) => request.status === 'APPROVED'),
    [requests],
  );
  const rejectedRequests = useMemo(
    () => requests.filter((request) => request.status === 'REJECTED'),
    [requests],
  );
  const filteredSentRequests = useMemo(
    () => sentRequests.filter((request) => isInHistoryRange(request.startDate, requestHistoryRange)),
    [requestHistoryRange, sentRequests],
  );
  const filteredApprovedRequests = useMemo(
    () => approvedRequests.filter((request) => isInHistoryRange(request.startDate, requestHistoryRange)),
    [approvedRequests, requestHistoryRange],
  );
  const filteredRejectedRequests = useMemo(
    () => rejectedRequests.filter((request) => isInHistoryRange(request.startDate, requestHistoryRange)),
    [rejectedRequests, requestHistoryRange],
  );
  const filteredWorkTrips = useMemo(
    () => workTrips.filter((trip) => isInHistoryRange(trip.trip_date.slice(0, 10), tripHistoryRange)),
    [tripHistoryRange, workTrips],
  );
  const employeeUsers = useMemo(
    () => allUsersList.filter((entry) => entry.role === 'EMPLOYEE'),
    [allUsersList],
  );

  const filteredAdminRequests = useMemo(
    () => allAdminRequests.filter((request) => {
      const inRange = isInHistoryRange((request.start_date ?? '').slice(0, 10), adminRequestHistoryRange);
      if (!inRange) {
        return false;
      }
      if (adminRequestStatusFilter === 'ALL') {
        return true;
      }
      return request.status === adminRequestStatusFilter;
    }),
    [adminRequestHistoryRange, adminRequestStatusFilter, allAdminRequests],
  );

  const adminCalendarData = useMemo(() => {
    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    const gridStart = addDays(monthStart, -((monthStart.getDay() + 6) % 7));
    const gridEnd = addDays(monthEnd, 6 - ((monthEnd.getDay() + 6) % 7));

    const days: Date[] = [];
    for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = addDays(cursor, 1)) {
      days.push(new Date(cursor));
    }

    const map: Record<string, CalendarDayDetails> = {};
    for (const request of allAdminRequests) {
      if (request.status !== 'PENDING' && request.status !== 'APPROVED') {
        continue;
      }

      const startIso = (request.start_date ?? '').slice(0, 10);
      const endIso = (request.end_date ?? '').slice(0, 10);
      if (!DATE_REGEX.test(startIso) || !DATE_REGEX.test(endIso)) {
        continue;
      }

      const start = parseIsoDateToUtc(startIso);
      const end = parseIsoDateToUtc(endIso);
      for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
        const iso = toIsoDate(cursor);
        if (!map[iso]) {
          map[iso] = { pendingUsers: [], approvedUsers: [] };
        }
        const userName = request.user_name ?? `ID ${request.user_id}`;
        if (request.status === 'PENDING') {
          if (!map[iso].pendingUsers.includes(userName)) {
            map[iso].pendingUsers.push(userName);
          }
        } else {
          if (!map[iso].approvedUsers.includes(userName)) {
            map[iso].approvedUsers.push(userName);
          }
        }
      }
    }

    return { days, map, monthStart };
  }, [allAdminRequests, calendarMonth]);

  const selectedCalendarDetails =
    adminCalendarData.map[selectedCalendarDate] ?? ({ pendingUsers: [], approvedUsers: [] } as CalendarDayDetails);

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

  const onDemandStats = useMemo(() => {
    const year = new Date().getFullYear();
    const yearRequests = requests.filter((request) => {
      if (request.leaveType !== 'ON_DEMAND') {
        return false;
      }
      const sourceDate = request.startDate || request.endDate;
      return DATE_REGEX.test(sourceDate) && Number(sourceDate.slice(0, 4)) === year;
    });

    const approvedDays = yearRequests
      .filter((request) => request.status === 'APPROVED')
      .reduce((sum, request) => sum + daysInclusive(request.startDate, request.endDate), 0);

    const pendingDays = yearRequests
      .filter((request) => request.status === 'PENDING')
      .reduce((sum, request) => sum + daysInclusive(request.startDate, request.endDate), 0);

    return {
      year,
      approvedDays,
      pendingDays,
      remainingDays: Math.max(0, 4 - approvedDays),
    };
  }, [requests]);

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
    setAllAdminRequests([]);
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
      setActiveTab(data.user.role === 'ADMIN' ? 'admin' : 'requests');
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
    const data = (await res.json()) as ApiNotification[];
    setNotifications(
      data.map((item) => ({
        id: item.id,
        event: item.event,
        message: item.message,
        status: item.status,
        created_at: item.created_at ?? item.createdAt ?? '',
      })),
    );
  }, [apiUrl, authFetch, user]);

  const loadPending = useCallback(async () => {
    if (!user || user.role !== 'ADMIN') return;
    const res = await authFetch(`${apiUrl}/leave-requests/pending`);
    if (!res || !res.ok) return;
    const data = (await res.json()) as PendingItem[];
    setPendingRequests(data);
  }, [apiUrl, authFetch, user]);

  const loadAllRequestsForAdmin = useCallback(async () => {
    if (!user || user.role !== 'ADMIN') return;
    const res = await authFetch(`${apiUrl}/leave-requests/all`);
    if (!res || !res.ok) return;
    const data = (await res.json()) as AdminLeaveRequest[];
    setAllAdminRequests(data);
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

  const refreshSessionData = useCallback(async () => {
    if (!user) {
      return;
    }

    const tasks: Promise<unknown>[] = [
      loadMyRequests(),
      loadWorkTrips(),
      loadNotifications(),
      loadLeaveLimit(),
    ];

    if (user.role === 'ADMIN') {
      tasks.push(loadPending(), loadAllRequestsForAdmin(), loadAllUsers(), loadAllLimits(), loadAllTrips());
    }

    await Promise.all(tasks);
  }, [loadAllLimits, loadAllRequestsForAdmin, loadAllTrips, loadAllUsers, loadLeaveLimit, loadMyRequests, loadNotifications, loadPending, loadWorkTrips, user]);

  const cancelRequestForAdmin = useCallback(async (requestId: number) => {
    const res = await authFetch(`${apiUrl}/leave-requests/${requestId}/admin`, { method: 'DELETE' });
    if (!res || !res.ok) {
      setError('Nie udalo sie anulowac wniosku.');
      return;
    }
    await Promise.all([loadPending(), loadAllRequestsForAdmin()]);
  }, [apiUrl, authFetch, loadAllRequestsForAdmin, loadPending]);

  const setLimitForUser = useCallback(async () => {
    const uid = selectedLimitUserId ?? Number(editLimitUserId);
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
  }, [apiUrl, authFetch, selectedLimitUserId, editLimitUserId, editLimitDays, loadAllLimits]);

  const createNewUser = useCallback(async () => {
    if (!newUserName.trim() || !newUserEmail.trim()) { setError('Podaj imie i email.'); return; }
    setNewUserBusy(true);
    const normalizedName = newUserName.trim();
    const normalizedEmail = newUserEmail.trim();
    const normalizedPassword = newUserPassword.trim();
    const roleChanged = editingUserId
      ? allUsersList.find((entry) => entry.id === editingUserId)?.role !== newUserRole
      : false;

    const res = editingUserId
      ? await authFetch(`${apiUrl}/auth/users/${editingUserId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: normalizedName,
            email: normalizedEmail,
            password: normalizedPassword.length > 0 ? normalizedPassword : undefined,
          }),
        })
      : await authFetch(`${apiUrl}/auth/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: normalizedName, email: normalizedEmail, password: normalizedPassword || '12345678', role: newUserRole }),
        });
    setNewUserBusy(false);
    if (!res || !res.ok) { setError(editingUserId ? 'Blad edycji uzytkownika.' : 'Blad tworzenia uzytkownika.'); return; }

    if (editingUserId && roleChanged) {
      const roleRes = await authFetch(`${apiUrl}/auth/users/${editingUserId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newUserRole }),
      });
      if (!roleRes || !roleRes.ok) {
        setError('Zmieniono dane, ale nie udalo sie zaktualizowac roli.');
      }
    }

    setNewUserName('');
    setNewUserEmail('');
    setNewUserPassword('12345678');
    setNewUserRole('EMPLOYEE');
    setEditingUserId(null);
    await loadAllUsers();
    await loadLoginUsers();
  }, [apiUrl, authFetch, editingUserId, allUsersList, newUserName, newUserEmail, newUserPassword, newUserRole, loadAllUsers, loadLoginUsers]);

  const beginEditUser = useCallback((target: UserPickItem) => {
    setEditingUserId(target.id);
    setNewUserName(target.name);
    setNewUserEmail(target.email);
    setNewUserPassword('');
    setNewUserRole(target.role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE');
    setError('');
  }, []);

  const cancelEditUser = useCallback(() => {
    setEditingUserId(null);
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPassword('12345678');
    setNewUserRole('EMPLOYEE');
  }, []);

  const deleteUser = useCallback(async (userId: number) => {
    const res = await authFetch(`${apiUrl}/auth/users/${userId}`, { method: 'DELETE' });
    if (!res || !res.ok) {
      setError('Nie udalo sie usunac uzytkownika.');
      return;
    }
    await loadAllUsers();
    await loadLoginUsers();
  }, [apiUrl, authFetch, loadAllUsers, loadLoginUsers]);

  const beginReviewTrip = useCallback((trip: WorkTripAdmin) => {
    setAdminTripReviewId(trip.id);
    setAdminTripStartTime((trip.start_time ?? '08:00').slice(0, 5));
    setAdminTripEndTime((trip.end_time ?? '16:00').slice(0, 5));
    setAdminTripComment(trip.manager_comment ?? '');
    setError('');
  }, []);

  const cancelReviewTrip = useCallback(() => {
    setAdminTripReviewId(null);
    setAdminTripComment('');
  }, []);

  const reviewTrip = useCallback(async (decision: 'APPROVED' | 'REJECTED' | 'ADJUSTED') => {
    if (!adminTripReviewId) {
      return;
    }
    setAdminTripBusy(true);
    const res = await authFetch(`${apiUrl}/work-trips/${adminTripReviewId}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision,
        startTime: decision === 'ADJUSTED' ? adminTripStartTime : undefined,
        endTime: decision === 'ADJUSTED' ? adminTripEndTime : undefined,
        comment: adminTripComment.trim() || undefined,
      }),
    });
    setAdminTripBusy(false);
    if (!res || !res.ok) {
      setError('Nie udalo sie zapisac decyzji dla godzin wyjazdowych.');
      return;
    }
    cancelReviewTrip();
    await loadAllTrips();
  }, [adminTripComment, adminTripEndTime, adminTripReviewId, adminTripStartTime, apiUrl, authFetch, cancelReviewTrip, loadAllTrips]);

  const cancelRequest = useCallback(async (requestId: number) => {
    const res = await authFetch(`${apiUrl}/leave-requests/${requestId}`, { method: 'DELETE' });
    if (!res) return;
    if (!res.ok) {
      setError('Nie udalo sie anulowac wniosku.');
      return;
    }
    await loadMyRequests();

  }, [apiUrl, authFetch, loadMyRequests]);

  const beginEditRequest = useCallback((item: LeaveRequest) => {
    setRequestEditId(item.id);
    setRequestEditUpdatedAt(item.updatedAt ?? null);
    setLeaveType(item.leaveType);
    setStartDate(item.startDate);
    setEndDate(item.endDate);
    setReason(item.reason ?? '');
    setError('');
  }, []);

  const cancelEditRequest = useCallback(() => {
    setRequestEditId(null);
    setRequestEditUpdatedAt(null);
    setLeaveType('ANNUAL');
    setStartDate(toIsoDate(new Date()));
    setEndDate(toIsoDate(new Date()));
    setReason('');
  }, []);

  const notifListenerRef = useRef<ReturnType<typeof Notifications.addNotificationReceivedListener> | null>(null);
  const realtimeRef = useRef<EventSource | null>(null);

  const registerPushToken = useCallback(async (accessToken: string): Promise<void> => {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Powiadomienia',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#0f172a',
        });
      }
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
    await Promise.all([loadPending(), loadAllRequestsForAdmin()]);
    setDecisionBusy(false);
  }, [apiUrl, authFetch, decisionComment, loadAllRequestsForAdmin, loadPending]);

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

  const beginEditTripHours = useCallback((trip: WorkTrip) => {
    setTripEditId(trip.id);
    setTripEditStartTime(trip.start_time.slice(0, 5));
    setTripEditEndTime(trip.end_time.slice(0, 5));
    setTripEditDestination(trip.destination ?? '');
    setTripEditDescription(trip.description ?? '');
    setError('');
  }, []);

  const cancelEditTripHours = useCallback(() => {
    setTripEditId(null);
    setTripEditDestination('');
    setTripEditDescription('');
  }, []);

  const saveTripHours = useCallback(async () => {
    if (!tripEditId) {
      return;
    }
    if (tripEditEndTime <= tripEditStartTime) {
      setError('Godzina zakonczenia musi byc pozniejsza niz rozpoczecia.');
      return;
    }

    setTripEditBusy(true);
    const res = await authFetch(`${apiUrl}/work-trips/${tripEditId}/hours`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startTime: tripEditStartTime,
        endTime: tripEditEndTime,
        destination: tripEditDestination,
        description: tripEditDescription,
      }),
    });
    setTripEditBusy(false);

    if (!res || !res.ok) {
      setError('Nie udalo sie zapisac zmian godzin wyjazdu.');
      return;
    }

    setTripEditId(null);
    setTripEditDestination('');
    setTripEditDescription('');
    await loadWorkTrips();
  }, [
    apiUrl,
    authFetch,
    loadWorkTrips,
    tripEditDescription,
    tripEditDestination,
    tripEditEndTime,
    tripEditId,
    tripEditStartTime,
  ]);

  async function submitRequest() {
    if (!user || user.role !== 'EMPLOYEE') {
      return;
    }

    setError('');

    if (!DATE_REGEX.test(startDate) || !DATE_REGEX.test(endDate)) {
      setError('Nieprawidlowy format daty.');
      return;
    }

    if (leaveType === 'ON_DEMAND') {
      const requestedDays = daysInclusive(startDate, endDate);
      if (requestedDays <= 0) {
        setError('Nieprawidlowy zakres dat dla urlopu na zadanie.');
        return;
      }

      if (onDemandStats.approvedDays + onDemandStats.pendingDays + requestedDays > 4) {
        setError(`Limit urlopu na zadanie to 4 dni/rok. Wykorzystane i oczekujace: ${onDemandStats.approvedDays + onDemandStats.pendingDays}.`);
        return;
      }
    }

    setSubmitBusy(true);
    const targetUrl = requestEditId
      ? `${apiUrl}/leave-requests/${requestEditId}`
      : `${apiUrl}/leave-requests`;

    const res = await authFetch(targetUrl, {
      method: requestEditId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaveType,
        startDate,
        endDate,
        reason: reason.trim() ? reason.trim() : undefined,
        expectedUpdatedAt: requestEditId ? requestEditUpdatedAt ?? undefined : undefined,
      }),
    });

    if (!res) {
      setSubmitBusy(false);
      return;
    }

    if (!res.ok) {
      let message = requestEditId
        ? 'Nie udalo sie zapisac zmian wniosku.'
        : 'Nie udalo sie wyslac wniosku.';
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
      if (message.toLowerCase().includes('odswiez')) {
        await loadMyRequests();
      }
      setSubmitBusy(false);
      return;
    }

    cancelEditRequest();
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
          setError('Data zakonczenia nie moze byc wczesniejsza od daty rozpoczecia.');
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

  function openTripEditTimePicker(field: 'start' | 'end') {
    const currentVal = field === 'start' ? tripEditStartTime : tripEditEndTime;
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
        if (field === 'start') setTripEditStartTime(`${hh}:${mm}`);
        else setTripEditEndTime(`${hh}:${mm}`);
      },
    });
  }

  function openAdminTripTimePicker(field: 'start' | 'end') {
    const currentVal = field === 'start' ? adminTripStartTime : adminTripEndTime;
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
        if (field === 'start') setAdminTripStartTime(`${hh}:${mm}`);
        else setAdminTripEndTime(`${hh}:${mm}`);
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

    void refreshSessionData();
  }, [refreshSessionData, user]);

  useEffect(() => {
    // Odbierz powiadomienie gdy aplikacja jest na pierwszym planie
    notifListenerRef.current = Notifications.addNotificationReceivedListener(() => {
      void refreshSessionData();
    });
    // Klikniecie w powiadomienie otwiera zakladke powiadomien.
    const tapSub = Notifications.addNotificationResponseReceivedListener(() => {
      setActiveTab('notifications');
      void refreshSessionData();
    });
    return () => {
      notifListenerRef.current?.remove();
      tapSub.remove();
    };
  }, [refreshSessionData]);

  useEffect(() => {
    if (!user || !token) {
      realtimeRef.current?.close();
      realtimeRef.current = null;
      return;
    }

    const source = new EventSource(`${apiUrl}/realtime/stream?token=${encodeURIComponent(token)}`, {
      pollingInterval: 5000,
      timeout: 60000,
    });

    realtimeRef.current = source;
    const refreshFromRealtime = () => {
      void refreshSessionData();
    };

    const realtimeEvents = [
      'leave.request.created',
      'leave.request.approved',
      'leave.request.rejected',
      'leave.request.cancelled',
      'work.trip.created',
      'work.trip.approved',
      'work.trip.rejected',
      'work.trip.adjusted',
    ];

    for (const eventName of realtimeEvents) {
      source.addEventListener(eventName, refreshFromRealtime);
    }

    return () => {
      source.close();
      realtimeRef.current = null;
    };
  }, [apiUrl, refreshSessionData, token, user]);

  useEffect(() => {
    if (!token) {
      return;
    }

    void registerPushToken(token);
  }, [registerPushToken, token]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const intervalId = setInterval(() => {
      void refreshSessionData();
    }, 5000);

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshSessionData();
      }
    });

    return () => {
      clearInterval(intervalId);
      appStateSub.remove();
    };
  }, [refreshSessionData, user]);

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
                    <Text style={styles.userPickRole}>{roleLabel(u.role)}</Text>
                  </View>
                  {selectedUserId === u.id ? <Text style={styles.userPickCheck}>OK</Text> : null}
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
                <Text style={styles.limitBannerText}>
                  Na zadanie: {onDemandStats.approvedDays}/4 dni, oczekuje {onDemandStats.pendingDays}, pozostalo {onDemandStats.remainingDays}
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
                  style={[styles.tabButton, activeTab === 'calendar' ? styles.tabButtonActive : null]}
                  onPress={() => {
                    setActiveTab('calendar');
                    void loadAllRequestsForAdmin();
                  }}
                >
                  <Text style={[styles.tabButtonText, activeTab === 'calendar' ? styles.tabButtonTextActive : null]}>
                    Kalendarz
                  </Text>
                </TouchableOpacity>
              )}
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
                      <Text style={styles.subtitle}>
                        {requestEditId ? `Edycja wniosku #${requestEditId}` : 'Nowy wniosek do szefa'}
                      </Text>
                      <View style={styles.onDemandBanner}>
                        <Text style={styles.onDemandBannerText}>
                          Urlop na zadanie ({onDemandStats.year}): {onDemandStats.approvedDays}/4 dni zatwierdzonych
                        </Text>
                        <Text style={styles.onDemandBannerHint}>
                          Oczekujace: {onDemandStats.pendingDays} dni | Pozostalo: {onDemandStats.remainingDays} dni
                        </Text>
                      </View>
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
                        <Text style={styles.buttonText}>{requestEditId ? 'Zapisz zmiany' : 'Wyslij do szefa'}</Text>
                      </TouchableOpacity>
                      {requestEditId ? (
                        <TouchableOpacity style={styles.ghostButton} onPress={cancelEditRequest}>
                          <Text style={styles.ghostButtonText}>Anuluj edycje</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  )}

                  <View style={[styles.listHeaderRow, styles.listHeaderRowWrap]}>
                    <Text style={styles.subtitle}>{requestsTitle}</Text>
                    <View style={styles.listActionsRow}>
                      <TouchableOpacity style={[styles.ghostButton, styles.historyFilterButton]} onPress={() => setShowSentHistory((p) => !p)}>
                        <Text style={styles.ghostButtonText}>{showSentHistory ? 'Ukryj wyslane' : 'Wyslane'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.ghostButton, styles.historyFilterButton]} onPress={() => setShowApprovedHistory((p) => !p)}>
                        <Text style={styles.ghostButtonText}>{showApprovedHistory ? 'Ukryj zatwierdzone' : 'Zatwierdzone'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.ghostButton, styles.historyFilterButton]} onPress={() => setShowRejectedHistory((p) => !p)}>
                        <Text style={styles.ghostButtonText}>{showRejectedHistory ? 'Ukryj odrzucone' : 'Odrzucone'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.ghostButton, styles.historyFilterButton]} onPress={() => void loadMyRequests()}>
                        <Text style={styles.ghostButtonText}>Odswiez</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.listActionsRow}>
                      <TouchableOpacity
                        style={[styles.ghostButton, styles.historyFilterButton, requestHistoryRange === 'ALL' ? styles.historyFilterButtonActive : null]}
                        onPress={() => setRequestHistoryRange('ALL')}
                      >
                        <Text style={[styles.ghostButtonText, requestHistoryRange === 'ALL' ? styles.historyFilterTextActive : null]}>Wszystkie</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.ghostButton, styles.historyFilterButton, requestHistoryRange === 'MONTH' ? styles.historyFilterButtonActive : null]}
                        onPress={() => setRequestHistoryRange('MONTH')}
                      >
                        <Text style={[styles.ghostButtonText, requestHistoryRange === 'MONTH' ? styles.historyFilterTextActive : null]}>Ten miesiac</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.ghostButton, styles.historyFilterButton, requestHistoryRange === 'YEAR' ? styles.historyFilterButtonActive : null]}
                        onPress={() => setRequestHistoryRange('YEAR')}
                      >
                        <Text style={[styles.ghostButtonText, requestHistoryRange === 'YEAR' ? styles.historyFilterTextActive : null]}>Ten rok</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {showSentHistory && (
                    <View style={styles.historyCard}>
                      <Text style={styles.subtitle}>Historia wyslanych wnioskow</Text>
                      <Text style={styles.row}>Lacznie wyslanych: {filteredSentRequests.length}</Text>
                      <Text style={styles.hint}>Dane z bazy CLOUD API.</Text>
                      {filteredSentRequests.length === 0 ? <Text style={styles.row}>Brak wyslanych wnioskow.</Text> : null}
                      {filteredSentRequests.map((item) => (
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
                      <Text style={styles.row}>Lacznie zatwierdzonych: {filteredApprovedRequests.length}</Text>
                      <Text style={styles.hint}>Dane z bazy CLOUD API.</Text>
                      <View style={styles.counterGrid}>
                        {LEAVE_TYPES.map((type) => (
                          <View key={type.value} style={styles.counterItem}>
                            <Text style={styles.counterLabel}>{type.label}</Text>
                            <Text style={styles.counterValue}>{approvedHistoryStats.counts[type.value]}</Text>
                          </View>
                        ))}
                      </View>
                      {filteredApprovedRequests.length === 0 ? <Text style={styles.row}>Brak zatwierdzonych wnioskow.</Text> : null}
                      {filteredApprovedRequests.map((item) => (
                        <View key={`ah-${item.id}`} style={styles.historyItem}>
                          <Text style={styles.row}>
                            #{item.id} | {formatDateLabel(item.startDate)} - {formatDateLabel(item.endDate)} |{' '}
                            {leaveTypeLabel(item.leaveType)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {showRejectedHistory && (
                    <View style={styles.historyCard}>
                      <Text style={styles.subtitle}>Historia odrzuconych wnioskow</Text>
                      <Text style={styles.row}>Lacznie odrzuconych: {filteredRejectedRequests.length}</Text>
                      {filteredRejectedRequests.length === 0 ? <Text style={styles.row}>Brak odrzuconych wnioskow.</Text> : null}
                      {filteredRejectedRequests.map((item) => (
                        <View key={`rh-${item.id}`} style={styles.historyItem}>
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
                        <View style={styles.decisionRow}>
                          <TouchableOpacity style={[styles.ghostButton, styles.pendingActionButton]} onPress={() => beginEditRequest(item)}>
                            <Text style={styles.ghostButtonText}>Edytuj</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.cancelButton, styles.pendingActionButton]} onPress={() => void cancelRequest(item.id)}>
                            <Text style={styles.cancelButtonText}>Anuluj</Text>
                          </TouchableOpacity>
                        </View>
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

                  <View style={[styles.listHeaderRow, styles.listHeaderRowWrap]}>
                    <Text style={styles.subtitle}>Historia wyjazdow ({filteredWorkTrips.length})</Text>
                    <TouchableOpacity style={styles.ghostButton} onPress={() => void loadWorkTrips()}>
                      <Text style={styles.ghostButtonText}>Odswiez</Text>
                    </TouchableOpacity>
                    <View style={styles.listActionsRow}>
                      <TouchableOpacity
                        style={[styles.ghostButton, styles.historyFilterButton, tripHistoryRange === 'ALL' ? styles.historyFilterButtonActive : null]}
                        onPress={() => setTripHistoryRange('ALL')}
                      >
                        <Text style={[styles.ghostButtonText, tripHistoryRange === 'ALL' ? styles.historyFilterTextActive : null]}>Wszystkie</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.ghostButton, styles.historyFilterButton, tripHistoryRange === 'MONTH' ? styles.historyFilterButtonActive : null]}
                        onPress={() => setTripHistoryRange('MONTH')}
                      >
                        <Text style={[styles.ghostButtonText, tripHistoryRange === 'MONTH' ? styles.historyFilterTextActive : null]}>Ten miesiac</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.ghostButton, styles.historyFilterButton, tripHistoryRange === 'YEAR' ? styles.historyFilterButtonActive : null]}
                        onPress={() => setTripHistoryRange('YEAR')}
                      >
                        <Text style={[styles.ghostButtonText, tripHistoryRange === 'YEAR' ? styles.historyFilterTextActive : null]}>Ten rok</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {filteredWorkTrips.length === 0 ? <Text style={styles.row}>Brak zapisanych wyjazdow.</Text> : null}
                  {filteredWorkTrips.map((trip) => (
                    <View key={trip.id} style={styles.requestCard}>
                      <View style={[styles.statusBadge, { backgroundColor: STATUS_META[trip.status ?? 'PENDING']?.background ?? '#f1f5f9' }]}>
                        <Text style={[styles.statusBadgeText, { color: STATUS_META[trip.status ?? 'PENDING']?.color ?? '#334155' }]}>
                          {STATUS_META[trip.status ?? 'PENDING']?.label ?? (trip.status ?? 'PENDING')}
                        </Text>
                      </View>
                      <Text style={styles.row}>
                        {formatDateLabel(trip.trip_date)} | {trip.start_time.slice(0, 5)} - {trip.end_time.slice(0, 5)}
                      </Text>
                      {trip.destination ? <Text style={styles.row}>Miejsce: {trip.destination}</Text> : null}
                      {trip.description ? <Text style={styles.row}>Opis: {trip.description}</Text> : null}
                      {trip.manager_comment ? <Text style={styles.managerCommentText}>Komentarz administratora: {trip.manager_comment}</Text> : null}
                      {tripEditId === trip.id ? (
                        <>
                          <View style={styles.decisionRow}>
                            <TouchableOpacity style={[styles.dateButton, styles.tripEditTimeButton]} onPress={() => openTripEditTimePicker('start')}>
                              <Text style={styles.dateButtonText}>Start: {tripEditStartTime}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.dateButton, styles.tripEditTimeButton]} onPress={() => openTripEditTimePicker('end')}>
                              <Text style={styles.dateButtonText}>Koniec: {tripEditEndTime}</Text>
                            </TouchableOpacity>
                          </View>
                          <TextInput
                            style={styles.input}
                            value={tripEditDestination}
                            onChangeText={setTripEditDestination}
                            placeholder="Miejsce docelowe"
                            placeholderTextColor="#64748b"
                            autoCorrect={false}
                            keyboardAppearance="light"
                            selectionColor="#0f172a"
                          />
                          <TextInput
                            style={[styles.input, styles.textArea]}
                            value={tripEditDescription}
                            onChangeText={setTripEditDescription}
                            placeholder="Opis wyjazdu (opcjonalnie)"
                            placeholderTextColor="#64748b"
                            autoCorrect={false}
                            keyboardAppearance="light"
                            selectionColor="#0f172a"
                            multiline
                          />
                          <View style={styles.decisionRow}>
                            <TouchableOpacity
                              style={[styles.button, styles.pendingActionButton, tripEditBusy ? styles.buttonDisabled : null]}
                              onPress={() => void saveTripHours()}
                              disabled={tripEditBusy}
                            >
                              <Text style={styles.buttonText}>Zapisz godziny</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.ghostButton, styles.pendingActionButton]} onPress={cancelEditTripHours}>
                              <Text style={styles.ghostButtonText}>Anuluj</Text>
                            </TouchableOpacity>
                          </View>
                        </>
                      ) : ['PENDING', 'REJECTED'].includes(trip.status ?? 'PENDING') ? (
                        <TouchableOpacity style={styles.ghostButton} onPress={() => beginEditTripHours(trip)}>
                          <Text style={styles.ghostButtonText}>Edytuj godziny</Text>
                        </TouchableOpacity>
                      ) : null}
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

              {/* ======= TAB: KALENDARZ ADMINA ======= */}
              {activeTab === 'calendar' && user.role === 'ADMIN' && (
                <>
                  <View style={styles.listHeaderRow}>
                    <Text style={styles.subtitle}>Kalendarz urlopow</Text>
                    <TouchableOpacity style={styles.ghostButton} onPress={() => void loadAllRequestsForAdmin()}>
                      <Text style={styles.ghostButtonText}>Odswiez</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.calendarLegendRow}>
                    <View style={styles.calendarLegendItem}>
                      <View style={[styles.calendarLegendDot, { backgroundColor: '#f97316' }]} />
                      <Text style={styles.hint}>Przetwarzany</Text>
                    </View>
                    <View style={styles.calendarLegendItem}>
                      <View style={[styles.calendarLegendDot, { backgroundColor: '#16a34a' }]} />
                      <Text style={styles.hint}>Zatwierdzony</Text>
                    </View>
                  </View>

                  <View style={styles.calendarHeaderRow}>
                    <TouchableOpacity
                      style={styles.ghostButton}
                      onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    >
                      <Text style={styles.ghostButtonText}>{'<'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.calendarMonthLabel}>{formatMonthLabel(adminCalendarData.monthStart)}</Text>
                    <TouchableOpacity
                      style={styles.ghostButton}
                      onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    >
                      <Text style={styles.ghostButtonText}>{'>'}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.calendarWeekLabelsRow}>
                    {['Pn', 'Wt', 'Sr', 'Cz', 'Pt', 'So', 'Nd'].map((label) => (
                      <Text key={label} style={styles.calendarWeekLabel}>{label}</Text>
                    ))}
                  </View>

                  <View style={styles.calendarGrid}>
                    {adminCalendarData.days.map((dateObj) => {
                      const iso = toIsoDate(dateObj);
                      const details = adminCalendarData.map[iso];
                      const inCurrentMonth = dateObj.getMonth() === adminCalendarData.monthStart.getMonth();
                      const isSelected = selectedCalendarDate === iso;
                      const pendingCount = details?.pendingUsers.length ?? 0;
                      const approvedCount = details?.approvedUsers.length ?? 0;

                      return (
                        <TouchableOpacity
                          key={iso}
                          style={[
                            styles.calendarDayCell,
                            !inCurrentMonth ? styles.calendarDayCellMuted : null,
                            isSelected ? styles.calendarDayCellSelected : null,
                          ]}
                          onPress={() => setSelectedCalendarDate(iso)}
                        >
                          <Text style={[styles.calendarDayText, !inCurrentMonth ? styles.calendarDayTextMuted : null]}>
                            {dateObj.getDate()}
                          </Text>
                          <View style={styles.calendarDotsRow}>
                            {pendingCount > 0 ? <View style={[styles.calendarDot, { backgroundColor: '#f97316' }]} /> : null}
                            {approvedCount > 0 ? <View style={[styles.calendarDot, { backgroundColor: '#16a34a' }]} /> : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.historyCard}>
                    <Text style={styles.subtitle}>Dzien {formatDateLabel(selectedCalendarDate)}</Text>
                    {selectedCalendarDetails.pendingUsers.length === 0 && selectedCalendarDetails.approvedUsers.length === 0 ? (
                      <Text style={styles.row}>Brak zaplanowanych urlopow.</Text>
                    ) : null}

                    {selectedCalendarDetails.pendingUsers.length > 0 ? (
                      <>
                        <Text style={styles.row}>Przetwarzane:</Text>
                        {selectedCalendarDetails.pendingUsers.map((name) => (
                          <Text key={`p-${selectedCalendarDate}-${name}`} style={styles.row}>- {name}</Text>
                        ))}
                      </>
                    ) : null}

                    {selectedCalendarDetails.approvedUsers.length > 0 ? (
                      <>
                        <Text style={styles.row}>Zatwierdzone:</Text>
                        {selectedCalendarDetails.approvedUsers.map((name) => (
                          <Text key={`a-${selectedCalendarDate}-${name}`} style={styles.row}>- {name}</Text>
                        ))}
                      </>
                    ) : null}
                  </View>
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
                          <Text style={styles.row}>Pracownik: {item.user_name ?? `ID ${item.user_id}`}</Text>
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

                      <View style={[styles.listHeaderRow, styles.listHeaderRowWrap]}>
                        <Text style={styles.subtitle}>Historia wszystkich wnioskow ({filteredAdminRequests.length})</Text>
                        <View style={styles.listActionsRow}>
                          <TouchableOpacity style={styles.ghostButton} onPress={() => void loadAllRequestsForAdmin()}>
                            <Text style={styles.ghostButtonText}>Odswiez</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.ghostButton, styles.historyFilterButton, adminRequestHistoryRange === 'ALL' ? styles.historyFilterButtonActive : null]}
                            onPress={() => setAdminRequestHistoryRange('ALL')}
                          >
                            <Text style={[styles.ghostButtonText, adminRequestHistoryRange === 'ALL' ? styles.historyFilterTextActive : null]}>Wszystkie</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.ghostButton, styles.historyFilterButton, adminRequestHistoryRange === 'MONTH' ? styles.historyFilterButtonActive : null]}
                            onPress={() => setAdminRequestHistoryRange('MONTH')}
                          >
                            <Text style={[styles.ghostButtonText, adminRequestHistoryRange === 'MONTH' ? styles.historyFilterTextActive : null]}>Ten miesiac</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.ghostButton, styles.historyFilterButton, adminRequestHistoryRange === 'YEAR' ? styles.historyFilterButtonActive : null]}
                            onPress={() => setAdminRequestHistoryRange('YEAR')}
                          >
                            <Text style={[styles.ghostButtonText, adminRequestHistoryRange === 'YEAR' ? styles.historyFilterTextActive : null]}>Ten rok</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.listActionsRow}>
                          {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as AdminRequestStatusFilter[]).map((statusFilter) => (
                            <TouchableOpacity
                              key={`admin-status-${statusFilter}`}
                              style={[styles.ghostButton, styles.historyFilterButton, adminRequestStatusFilter === statusFilter ? styles.historyFilterButtonActive : null]}
                              onPress={() => setAdminRequestStatusFilter(statusFilter)}
                            >
                              <Text style={[styles.ghostButtonText, adminRequestStatusFilter === statusFilter ? styles.historyFilterTextActive : null]}>
                                {statusFilter === 'ALL' ? 'Status: wszystkie' : STATUS_META[statusFilter]?.label ?? statusFilter}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>

                      {filteredAdminRequests.length === 0 ? <Text style={styles.row}>Brak wnioskow w historii.</Text> : null}
                      {filteredAdminRequests.map((item) => (
                        <View key={`adm-hist-${item.id}`} style={styles.requestCard}>
                          <View style={[styles.statusBadge, { backgroundColor: STATUS_META[item.status]?.background ?? '#f1f5f9' }]}>
                            <Text style={[styles.statusBadgeText, { color: STATUS_META[item.status]?.color ?? '#334155' }]}>
                              {STATUS_META[item.status]?.label ?? item.status}
                            </Text>
                          </View>
                          <Text style={styles.row}>
                            #{item.id} | {item.user_name ?? `ID ${item.user_id}`} | {formatDateLabel((item.start_date ?? '').slice(0, 10))} - {formatDateLabel((item.end_date ?? '').slice(0, 10))}
                          </Text>
                          <Text style={styles.row}>Typ: {item.leave_type}</Text>
                          {item.reason ? <Text style={styles.row}>Powod: {item.reason}</Text> : null}
                          {item.manager_comment ? <Text style={styles.managerCommentText}>Komentarz: {item.manager_comment}</Text> : null}

                          {item.status === 'PENDING' ? (
                            <View style={styles.decisionRow}>
                              <TouchableOpacity style={[styles.approveButton, decisionBusy ? styles.buttonDisabled : null]}
                                disabled={decisionBusy} onPress={() => void decideRequest(item.id, 'APPROVED')}>
                                <Text style={styles.buttonText}>Akceptuj</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[styles.rejectButton, decisionBusy ? styles.buttonDisabled : null]}
                                disabled={decisionBusy} onPress={() => void decideRequest(item.id, 'REJECTED')}>
                                <Text style={styles.buttonText}>Odrzuc</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[styles.cancelButton, decisionBusy ? styles.buttonDisabled : null]}
                                disabled={decisionBusy} onPress={() => void cancelRequestForAdmin(item.id)}>
                                <Text style={styles.cancelButtonText}>Anuluj</Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}
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
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller}>
                          <View style={styles.typeRow}>
                            {employeeUsers.map((entry) => (
                              <TouchableOpacity
                                key={`limit-${entry.id}`}
                                style={[styles.typeButton, selectedLimitUserId === entry.id ? styles.typeButtonActive : null]}
                                onPress={() => {
                                  setSelectedLimitUserId(entry.id);
                                  setEditLimitUserId(String(entry.id));
                                }}
                              >
                                <Text style={[styles.typeButtonText, selectedLimitUserId === entry.id ? styles.typeButtonTextActive : null]}>
                                  {entry.name}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
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
                          <View style={[styles.statusBadge, { backgroundColor: STATUS_META[trip.status ?? 'PENDING']?.background ?? '#f1f5f9' }]}>
                            <Text style={[styles.statusBadgeText, { color: STATUS_META[trip.status ?? 'PENDING']?.color ?? '#334155' }]}>
                              {STATUS_META[trip.status ?? 'PENDING']?.label ?? (trip.status ?? 'PENDING')}
                            </Text>
                          </View>
                          <Text style={styles.row}>
                            {trip.user_name ?? `ID ${trip.user_id}`} | {trip.trip_date?.slice(0, 10)} | {trip.start_time?.slice(0, 5)} - {trip.end_time?.slice(0, 5)}
                          </Text>
                          {trip.destination ? <Text style={styles.row}>Miejsce: {trip.destination}</Text> : null}
                          {trip.description ? <Text style={styles.row}>Opis: {trip.description}</Text> : null}
                          {trip.manager_comment ? <Text style={styles.managerCommentText}>Komentarz: {trip.manager_comment}</Text> : null}
                          {adminTripReviewId === trip.id ? (
                            <>
                              <View style={styles.decisionRow}>
                                <TouchableOpacity style={[styles.dateButton, styles.tripEditTimeButton]} onPress={() => openAdminTripTimePicker('start')}>
                                  <Text style={styles.dateButtonText}>Start: {adminTripStartTime}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.dateButton, styles.tripEditTimeButton]} onPress={() => openAdminTripTimePicker('end')}>
                                  <Text style={styles.dateButtonText}>Koniec: {adminTripEndTime}</Text>
                                </TouchableOpacity>
                              </View>
                              <TextInput
                                style={[styles.input, styles.textArea]}
                                value={adminTripComment}
                                onChangeText={setAdminTripComment}
                                placeholder="Komentarz administratora"
                                placeholderTextColor="#64748b"
                                selectionColor="#0f172a"
                                multiline
                              />
                              <View style={styles.decisionRow}>
                                <TouchableOpacity style={[styles.approveButton, styles.pendingActionButton, adminTripBusy ? styles.buttonDisabled : null]} disabled={adminTripBusy} onPress={() => void reviewTrip('APPROVED')}>
                                  <Text style={styles.buttonText}>Przyjmij</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.rejectButton, styles.pendingActionButton, adminTripBusy ? styles.buttonDisabled : null]} disabled={adminTripBusy} onPress={() => void reviewTrip('REJECTED')}>
                                  <Text style={styles.buttonText}>Odrzuc</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.button, styles.pendingActionButton, adminTripBusy ? styles.buttonDisabled : null]} disabled={adminTripBusy} onPress={() => void reviewTrip('ADJUSTED')}>
                                  <Text style={styles.buttonText}>Skoryguj</Text>
                                </TouchableOpacity>
                              </View>
                              <TouchableOpacity style={styles.ghostButton} onPress={cancelReviewTrip}>
                                <Text style={styles.ghostButtonText}>Anuluj review</Text>
                              </TouchableOpacity>
                            </>
                          ) : (
                            <TouchableOpacity style={styles.ghostButton} onPress={() => beginReviewTrip(trip)}>
                              <Text style={styles.ghostButtonText}>Review godzin</Text>
                            </TouchableOpacity>
                          )}
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
                        <Text style={styles.caption}>{editingUserId ? `Edycja uzytkownika #${editingUserId}` : 'Dodaj uzytkownika'}</Text>
                        <TextInput style={styles.input} value={newUserName} onChangeText={setNewUserName}
                          placeholder="Imie i nazwisko" placeholderTextColor="#64748b" selectionColor="#0f172a" />
                        <TextInput style={styles.input} value={newUserEmail} onChangeText={setNewUserEmail}
                          placeholder="Email" placeholderTextColor="#64748b" autoCapitalize="none" selectionColor="#0f172a" />
                        <TextInput style={styles.input} value={newUserPassword} onChangeText={setNewUserPassword}
                          placeholder={editingUserId ? 'Nowe haslo (opcjonalnie)' : 'Haslo'} placeholderTextColor="#64748b" selectionColor="#0f172a" secureTextEntry />
                        <View style={styles.typeRow}>
                          {(['EMPLOYEE', 'ADMIN'] as const).map((r) => (
                            <TouchableOpacity key={r}
                              style={[styles.typeButton, newUserRole === r ? styles.typeButtonActive : null]}
                              onPress={() => setNewUserRole(r)}>
                              <Text style={[styles.typeButtonText, newUserRole === r ? styles.typeButtonTextActive : null]}>{roleLabel(r)}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <TouchableOpacity style={[styles.button, newUserBusy ? styles.buttonDisabled : null]}
                          disabled={newUserBusy} onPress={() => void createNewUser()}>
                          <Text style={styles.buttonText}>{editingUserId ? 'Zapisz uzytkownika' : 'Dodaj uzytkownika'}</Text>
                        </TouchableOpacity>
                        {editingUserId ? (
                          <TouchableOpacity style={styles.ghostButton} onPress={cancelEditUser}>
                            <Text style={styles.ghostButtonText}>Anuluj edycje</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      {allUsersList.map((u) => (
                        <View key={`usr-${u.id}`} style={styles.requestCard}>
                          <Text style={styles.row}>{u.name} - {roleLabel(u.role)}</Text>
                          <Text style={styles.hint}>{u.email}</Text>
                          <View style={styles.decisionRow}>
                            <TouchableOpacity style={[styles.ghostButton, styles.pendingActionButton]} onPress={() => beginEditUser(u)}>
                              <Text style={styles.ghostButtonText}>Edytuj</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.cancelButton, styles.pendingActionButton]} onPress={() => void deleteUser(u.id)}>
                              <Text style={styles.cancelButtonText}>Usun</Text>
                            </TouchableOpacity>
                          </View>
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
  onDemandBanner: {
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  onDemandBannerText: {
    color: '#1e3a8a',
    fontWeight: '700',
    fontSize: 13,
  },
  onDemandBannerHint: {
    color: '#1d4ed8',
    fontSize: 12,
    marginTop: 2,
  },
  caption: {
    color: '#334155',
    marginBottom: 6,
    fontWeight: '600',
  },
  chipScroller: {
    marginBottom: 8,
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
  listHeaderRowWrap: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
  },
  listActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    width: '100%',
    gap: 8,
  },
  historyFilterButton: {
    marginTop: 0,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexShrink: 1,
  },
  historyFilterButtonActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  historyFilterTextActive: {
    color: '#ffffff',
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
  calendarLegendRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  calendarLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calendarLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  calendarMonthLabel: {
    flex: 1,
    textAlign: 'center',
    color: '#0f172a',
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  calendarWeekLabelsRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calendarWeekLabel: {
    width: '14.2857%',
    textAlign: 'center',
    color: '#64748b',
    fontWeight: '600',
    fontSize: 12,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  calendarDayCell: {
    width: '14.2857%',
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarDayCellMuted: {
    backgroundColor: '#f8fafc',
  },
  calendarDayCellSelected: {
    borderColor: '#0f172a',
    backgroundColor: '#eff6ff',
  },
  calendarDayText: {
    color: '#0f172a',
    fontWeight: '600',
    fontSize: 12,
  },
  calendarDayTextMuted: {
    color: '#94a3b8',
  },
  calendarDotsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  calendarDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
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
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  pendingActionButton: {
    flex: 1,
    minWidth: 120,
  },
  tripEditTimeButton: {
    flex: 1,
    marginBottom: 0,
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

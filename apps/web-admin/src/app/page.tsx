"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AppRole = "ADMIN" | "MANAGER" | "EMPLOYEE";

type User = {
  id: number;
  name: string;
  email: string;
  role: AppRole;
  managerId: number | null;
};

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

type LeaveRequest = {
  id: number;
  user_id: number;
  manager_id: number | null;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  manager_comment: string | null;
  created_at: string;
};

type WorkTrip = {
  id: number;
  user_id: number;
  user_name?: string;
  trip_date: string;
  start_time: string;
  end_time: string;
  destination: string | null;
  description: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "ADJUSTED";
  manager_comment: string | null;
  decision_at: string | null;
};

type MailSettings = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapSecure: boolean;
  communicationMode: "MULTI" | "EMAIL_ONLY";
  smtpPassConfigured: boolean;
  imapPassConfigured: boolean;
};

type Attachment = {
  id: number;
  leave_request_id: number;
  uploaded_by: number;
  file_name: string;
  one_drive_web_url: string;
  file_size: number;
  created_at: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function roleLabel(role: AppRole): string {
  if (role === "ADMIN") {
    return "Administrator";
  }
  if (role === "MANAGER") {
    return "Kierownik";
  }
  return "Pracownik";
}

export default function Home() {
  const [email, setEmail] = useState("szef@firma.local");
  const [password, setPassword] = useState("szef123");
  const [comment, setComment] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [pending, setPending] = useState<LeaveRequest[]>([]);
  const [pendingTrips, setPendingTrips] = useState<WorkTrip[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [mailSettings, setMailSettings] = useState<MailSettings>({
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpFrom: "",
    imapHost: "",
    imapPort: 993,
    imapUser: "",
    imapSecure: true,
    communicationMode: "MULTI",
    smtpPassConfigured: false,
    imapPassConfigured: false,
  });
  const [smtpPassInput, setSmtpPassInput] = useState("");
  const [imapPassInput, setImapPassInput] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<AppRole>("EMPLOYEE");
  const [newUserManagerId, setNewUserManagerId] = useState("");
  const [selectedEditUserId, setSelectedEditUserId] = useState("");
  const [editUserName, setEditUserName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserPassword, setEditUserPassword] = useState("");
  const [editUserManagerId, setEditUserManagerId] = useState("");
  const [editUserRole, setEditUserRole] = useState<AppRole>("EMPLOYEE");
  const [selectedPermissionUserId, setSelectedPermissionUserId] = useState("");
  const [selectedPermissionRole, setSelectedPermissionRole] = useState<AppRole>("EMPLOYEE");
  const [selectedPermissionManagerId, setSelectedPermissionManagerId] = useState("");
  const [usersBusy, setUsersBusy] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const [attachmentsByRequest, setAttachmentsByRequest] = useState<Record<number, Attachment[]>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [tripBusyId, setTripBusyId] = useState<number | null>(null);
  const [uploadBusyId, setUploadBusyId] = useState<number | null>(null);
  const [tripComment, setTripComment] = useState("");
  const [editedTripHours, setEditedTripHours] = useState<Record<number, { startTime: string; endTime: string }>>({});
  const [error, setError] = useState("");

  const canModerate = useMemo(() => user?.role === "MANAGER" || user?.role === "ADMIN", [user]);
  const isAdmin = useMemo(() => user?.role === "ADMIN", [user]);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    setPending([]);
    setPendingTrips([]);
    setUsers([]);
    setSelectedEditUserId("");
    setEditUserName("");
    setEditUserEmail("");
    setEditUserPassword("");
    setEditUserManagerId("");
    setEditUserRole("EMPLOYEE");
    setSelectedPermissionUserId("");
    setSelectedPermissionRole("EMPLOYEE");
    setSelectedPermissionManagerId("");
    setSmtpPassInput("");
    setImapPassInput("");
    setAttachmentsByRequest({});
    setComment("");
    setTripComment("");
  }, []);

  async function login() {
    setError("");

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        setError("Logowanie nieudane.");
        return;
      }

      const data = (await res.json()) as LoginResponse;
      setUser(data.user);
      setToken(data.accessToken);
      setRefreshToken(data.refreshToken);

      if (data.user.role === "MANAGER" || data.user.role === "ADMIN") {
        const authHeader = { Authorization: `Bearer ${data.accessToken}` };

        const [pendingRes, tripsRes, usersRes, mailRes] = await Promise.all([
          fetch(`${API_URL}/leave-requests/pending`, { headers: authHeader }),
          fetch(`${API_URL}/work-trips/all`, { headers: authHeader }),
          fetch(`${API_URL}/auth/users`, { headers: authHeader }),
          fetch(`${API_URL}/auth/mail-settings`, { headers: authHeader }),
        ]);

        if (pendingRes.ok) {
          const rows = (await pendingRes.json()) as LeaveRequest[];
          setPending(rows);
        }

        if (usersRes.ok) {
          const rows = (await usersRes.json()) as User[];
          setUsers(rows);
        }

        if (tripsRes.ok) {
          const rows = (await tripsRes.json()) as WorkTrip[];
          setPendingTrips(rows.filter((trip) => trip.status === "PENDING"));
        }

        if (mailRes.ok) {
          const settings = (await mailRes.json()) as MailSettings;
          setMailSettings(settings);
        }
      }
    } catch {
      setError("Brak polaczenia z API.");
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
      setError("Brak polaczenia z API.");
      return null;
    }

    if (first.status !== 401 || !refreshToken) {
      return first;
    }

    let refreshRes: Response;
    try {
      refreshRes = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      setError("Brak polaczenia z API.");
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
      setError("Brak polaczenia z API.");
      return null;
    }
  }, [token, refreshToken]);

  const loadUsers = useCallback(async () => {
    if (!canModerate) {
      return;
    }

    const res = await authFetch(`${API_URL}/auth/users`);
    if (!res || !res.ok) {
      return;
    }

    const rows = (await res.json()) as User[];
    setUsers(rows);
  }, [authFetch, canModerate]);

  const loadPending = useCallback(async () => {
    if (!user || !canModerate) {
      return;
    }

    const res = await authFetch(`${API_URL}/leave-requests/pending`);
    if (!res) {
      return;
    }
    if (!res.ok) {
      setError("Nie mozna pobrac wnioskow.");
      return;
    }

    const rows = (await res.json()) as LeaveRequest[];
    setPending(rows);

    await Promise.all(
      rows.map(async (request) => {
        const listRes = await authFetch(`${API_URL}/attachments/leave-request/${request.id}`);
        if (!listRes || !listRes.ok) {
          return;
        }

        const list = (await listRes.json()) as Attachment[];
        setAttachmentsByRequest((prev) => ({ ...prev, [request.id]: list }));
      }),
    );
  }, [authFetch, user, canModerate]);

  const loadPendingTrips = useCallback(async () => {
    if (!user || !canModerate) {
      return;
    }

    const res = await authFetch(`${API_URL}/work-trips/all`);
    if (!res) {
      return;
    }
    if (!res.ok) {
      setError("Nie mozna pobrac godzin wyjazdowych.");
      return;
    }

    const rows = (await res.json()) as WorkTrip[];
    setPendingTrips(rows.filter((trip) => trip.status === "PENDING"));
  }, [authFetch, user, canModerate]);

  async function uploadAttachment(requestId: number, file: File) {
    setError("");
    setUploadBusyId(requestId);

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result ?? '');
        const commaIndex = value.indexOf(',');
        if (commaIndex < 0) {
          reject(new Error('Niepoprawny plik'));
          return;
        }
        resolve(value.slice(commaIndex + 1));
      };
      reader.onerror = () => reject(new Error('Nie mozna odczytac pliku'));
      reader.readAsDataURL(file);
    });

    const res = await authFetch(`${API_URL}/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        leaveRequestId: requestId,
        fileName: file.name,
        contentBase64: base64,
      }),
    });

    setUploadBusyId(null);

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
  }

  async function decide(id: number, decision: "APPROVED" | "REJECTED") {
    if (!user || !token) {
      return;
    }

    setBusyId(id);
    setError("");

    const res = await authFetch(`${API_URL}/leave-requests/${id}/decision`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision,
        comment: comment.trim() || undefined,
      }),
    });

    if (!res) {
      setBusyId(null);
      return;
    }

    setBusyId(null);

    if (!res.ok) {
      setError("Nie udalo sie zapisac decyzji.");
      return;
    }

    setComment("");
    await loadPending();
  }

  async function decideTrip(id: number, decision: "APPROVED" | "REJECTED" | "ADJUSTED") {
    if (!user || !token) {
      return;
    }

    setTripBusyId(id);
    setError("");

    const hours = editedTripHours[id];
    const body: { decision: "APPROVED" | "REJECTED" | "ADJUSTED"; comment?: string; startTime?: string; endTime?: string } = {
      decision,
      comment: tripComment.trim() || undefined,
    };

    if (decision === "ADJUSTED" && hours) {
      body.startTime = hours.startTime;
      body.endTime = hours.endTime;
    }

    const res = await authFetch(`${API_URL}/work-trips/${id}/review`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    setTripBusyId(null);

    if (!res || !res.ok) {
      setError("Nie udalo sie zapisac decyzji dla godzin wyjazdowych.");
      return;
    }

    setTripComment("");
    setEditedTripHours({});
    await loadPendingTrips();
  }

  async function createUser() {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      setError("Uzupelnij dane nowego uzytkownika.");
      return;
    }

    setUsersBusy(true);
    setError("");

    const managerIdValue = Number(newUserManagerId);
    const body: {
      name: string;
      email: string;
      password: string;
      role: AppRole;
      managerId?: number;
    } = {
      name: newUserName.trim(),
      email: newUserEmail.trim(),
      password: newUserPassword,
      role: newUserRole,
    };

    if (newUserRole === "EMPLOYEE") {
      if (Number.isInteger(managerIdValue) && managerIdValue > 0) {
        body.managerId = managerIdValue;
      } else if (user?.role === "ADMIN" && managerOptions.length > 0) {
        body.managerId = managerOptions[0].id;
      }
    }

    const res = await authFetch(`${API_URL}/auth/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    setUsersBusy(false);

    if (!res || !res.ok) {
      setError("Nie udalo sie utworzyc uzytkownika.");
      return;
    }

    setNewUserName("");
    setNewUserEmail("");
    setNewUserPassword("");
    setNewUserRole("EMPLOYEE");
    setNewUserManagerId("");
    await loadUsers();
  }

  async function updatePermissions() {
    if (!selectedPermissionUserId) {
      setError("Wybierz uzytkownika do zmiany uprawnien.");
      return;
    }

    setUsersBusy(true);
    setError("");

    const userId = Number(selectedPermissionUserId);
    const managerIdValue = Number(selectedPermissionManagerId);

    const body: { role: AppRole; managerId?: number } = { role: selectedPermissionRole };
    if (selectedPermissionRole === "EMPLOYEE" && Number.isInteger(managerIdValue) && managerIdValue > 0) {
      body.managerId = managerIdValue;
    }

    const res = await authFetch(`${API_URL}/auth/users/${userId}/role`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    setUsersBusy(false);

    if (!res || !res.ok) {
      setError("Nie udalo sie zaktualizowac uprawnien.");
      return;
    }

    await loadUsers();
  }

  async function updateUserSettings() {
    if (!selectedEditUserId) {
      setError("Wybierz uzytkownika do edycji ustawien.");
      return;
    }

    const selectedUser = users.find((item) => item.id === Number(selectedEditUserId));
    if (!selectedUser) {
      setError("Nie znaleziono wskazanego uzytkownika.");
      return;
    }

    setUsersBusy(true);
    setError("");

    const body: {
      name?: string;
      email?: string;
      password?: string;
      managerId?: number;
    } = {};

    if (editUserName.trim() && editUserName.trim() !== selectedUser.name) {
      body.name = editUserName.trim();
    }

    if (editUserEmail.trim() && editUserEmail.trim() !== selectedUser.email) {
      body.email = editUserEmail.trim();
    }

    if (editUserPassword.trim()) {
      body.password = editUserPassword;
    }

    if (selectedUser.role === "EMPLOYEE") {
      const managerValue = Number(editUserManagerId);
      if (Number.isInteger(managerValue) && managerValue > 0 && managerValue !== selectedUser.managerId) {
        body.managerId = managerValue;
      }
    }

    if (Object.keys(body).length === 0) {
      setUsersBusy(false);
      setError("Brak zmian do zapisania.");
      return;
    }

    let res: Response | null = null;
    if (Object.keys(body).length > 0) {
      res = await authFetch(`${API_URL}/auth/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res || !res.ok) {
        setUsersBusy(false);
        setError("Nie udalo sie zapisac ustawien uzytkownika.");
        return;
      }
    }

    if (isAdmin && editUserRole !== selectedUser.role) {
      const roleBody: { role: AppRole; managerId?: number } = { role: editUserRole };
      if (editUserRole === "EMPLOYEE") {
        const managerValue = Number(editUserManagerId);
        if (Number.isInteger(managerValue) && managerValue > 0) {
          roleBody.managerId = managerValue;
        }
      }

      const roleRes = await authFetch(`${API_URL}/auth/users/${selectedUser.id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(roleBody),
      });

      if (!roleRes || !roleRes.ok) {
        setUsersBusy(false);
        setError("Nie udalo sie zapisac roli uzytkownika.");
        return;
      }
    }

    setUsersBusy(false);

    setEditUserPassword("");
    await loadUsers();
  }

  async function saveMailSettings() {
    setMailBusy(true);
    setError("");

    const body: {
      smtpHost: string;
      smtpPort: number;
      smtpUser: string;
      smtpFrom: string;
      imapHost: string;
      imapPort: number;
      imapUser: string;
      imapSecure: number;
      communicationMode: "MULTI" | "EMAIL_ONLY";
      smtpPass?: string;
      imapPass?: string;
    } = {
      smtpHost: mailSettings.smtpHost.trim(),
      smtpPort: Number(mailSettings.smtpPort),
      smtpUser: mailSettings.smtpUser.trim(),
      smtpFrom: mailSettings.smtpFrom.trim(),
      imapHost: mailSettings.imapHost.trim(),
      imapPort: Number(mailSettings.imapPort),
      imapUser: mailSettings.imapUser.trim(),
      imapSecure: mailSettings.imapSecure ? 1 : 0,
      communicationMode: mailSettings.communicationMode,
    };

    if (smtpPassInput.trim()) {
      body.smtpPass = smtpPassInput;
    }

    if (imapPassInput.trim()) {
      body.imapPass = imapPassInput;
    }

    const res = await authFetch(`${API_URL}/auth/mail-settings`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    setMailBusy(false);

    if (!res || !res.ok) {
      setError("Nie udalo sie zapisac konfiguracji poczty.");
      return;
    }

    const data = (await res.json()) as MailSettings;
    setMailSettings(data);
    setSmtpPassInput("");
    setImapPassInput("");
  }

  async function logoutCurrentSession() {
    if (!token || !refreshToken) {
      clearSession();
      return;
    }

    await fetch(`${API_URL}/auth/logout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
      method: "POST",
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

    if (!token) {
      return;
    }

    const source = new EventSource(`${API_URL}/realtime/stream?token=${encodeURIComponent(token)}`);
    source.onmessage = () => {
      if (canModerate) {
        void loadPending();
        void loadPendingTrips();
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [user, canModerate, loadPending, loadPendingTrips, token]);

  useEffect(() => {
    if (!user || !canModerate) {
      return;
    }

    void loadPendingTrips();
  }, [user, canModerate, loadPendingTrips]);

  const managerOptions = users.filter((item) => item.role === "MANAGER" || item.role === "ADMIN");

  const availableRolesForCreate: AppRole[] =
    user?.role === "ADMIN" ? ["EMPLOYEE", "MANAGER", "ADMIN"] : ["EMPLOYEE"];

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <main className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-3xl font-bold">Panel URLopy - Admin i Szef</h1>

        {!user && (
          <section className="rounded-xl bg-white p-5 shadow">
            <h2 className="mb-3 text-lg font-semibold">Logowanie</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded border border-slate-300 p-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email"
              />
              <input
                className="rounded border border-slate-300 p-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="haslo"
                type="password"
              />
            </div>
            <button
              className="mt-4 rounded bg-slate-900 px-4 py-2 text-white"
              onClick={() => {
                void login();
              }}
            >
              Zaloguj
            </button>
            <p className="mt-3 text-sm text-slate-600">
              Test manager: szef@firma.local / szef123
            </p>
          </section>
        )}

        {user && (
          <section className="rounded-xl bg-white p-5 shadow">
            <p>
              Zalogowany: <strong>{user.name}</strong> ({roleLabel(user.role)})
            </p>
            <div className="mt-3 flex gap-2">
              <button
                className="rounded border border-slate-300 px-3 py-2 text-sm"
                onClick={() => {
                  void logoutCurrentSession();
                }}
              >
                Wyloguj z tego urzadzenia
              </button>
              <button
                className="rounded bg-slate-800 px-3 py-2 text-sm text-white"
                onClick={() => {
                  void logoutAllSessions();
                }}
              >
                Wyloguj ze wszystkich urzadzen
              </button>
            </div>
          </section>
        )}

        {user && canModerate && (
          <section className="space-y-3 rounded-xl bg-white p-5 shadow">
            <h2 className="text-lg font-semibold">Wnioski oczekujace</h2>
            <textarea
              className="w-full rounded border border-slate-300 p-2"
              value={comment}
              placeholder="Komentarz do decyzji (opcjonalny)"
              onChange={(e) => setComment(e.target.value)}
            />

            {pending.length === 0 && <p>Brak oczekujacych wnioskow.</p>}

            {pending.map((request) => (
              <article key={request.id} className="rounded border border-slate-200 p-4">
                <p className="font-semibold">Wniosek #{request.id}</p>
                <p>
                  Pracownik: {request.user_id} | Typ: {request.leave_type}
                </p>
                <p>
                  Termin: {request.start_date} - {request.end_date}
                </p>
                <p>Powod: {request.reason || "-"}</p>

                <div className="mt-3 flex gap-2">
                  <button
                    disabled={busyId === request.id}
                    className="rounded bg-emerald-600 px-3 py-2 text-white disabled:opacity-50"
                    onClick={() => {
                      void decide(request.id, "APPROVED");
                    }}
                  >
                    Zatwierdz
                  </button>
                  <button
                    disabled={busyId === request.id}
                    className="rounded bg-rose-600 px-3 py-2 text-white disabled:opacity-50"
                    onClick={() => {
                      void decide(request.id, "REJECTED");
                    }}
                  >
                    Odrzuc
                  </button>
                </div>

                <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-sm font-semibold">Zalaczniki</p>
                  <input
                    type="file"
                    disabled={uploadBusyId === request.id}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) {
                        return;
                      }

                      void uploadAttachment(request.id, file);
                      e.currentTarget.value = '';
                    }}
                  />
                  <ul className="mt-2 space-y-1 text-sm">
                    {(attachmentsByRequest[request.id] ?? []).map((item) => (
                      <li key={item.id}>
                        <a className="text-sky-700 underline" href={item.one_drive_web_url} target="_blank" rel="noreferrer">
                          {item.file_name}
                        </a>{' '}
                        ({Math.round(item.file_size / 1024)} KB)
                      </li>
                    ))}
                    {(attachmentsByRequest[request.id] ?? []).length === 0 && (
                      <li className="text-slate-500">Brak zalacznikow.</li>
                    )}
                  </ul>
                </div>
              </article>
            ))}
          </section>
        )}

        {user && canModerate && (
          <section className="space-y-3 rounded-xl bg-white p-5 shadow">
            <h2 className="text-lg font-semibold">Godziny wyjazdowe oczekujace</h2>
            <textarea
              className="w-full rounded border border-slate-300 p-2"
              value={tripComment}
              placeholder="Komentarz do decyzji (opcjonalny)"
              onChange={(e) => setTripComment(e.target.value)}
            />

            {pendingTrips.length === 0 && <p>Brak oczekujacych godzin wyjazdowych.</p>}

            {pendingTrips.map((trip) => (
              <article key={trip.id} className="rounded border border-slate-200 p-4">
                <p className="font-semibold">Wyjazd #{trip.id}</p>
                <p>
                  Pracownik: {trip.user_name ?? `ID ${trip.user_id}`} | Data: {trip.trip_date.slice(0, 10)}
                </p>
                <p>
                  Godziny: {trip.start_time.slice(0, 5)} - {trip.end_time.slice(0, 5)}
                </p>
                <p>Miejsce: {trip.destination || "-"}</p>
                <p>Opis: {trip.description || "-"}</p>

                <div className="mt-3 space-y-2">
                  <p className="text-sm font-medium">Edycja godzin (opcjonalnie):</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      type="time"
                      className="rounded border border-slate-300 p-2"
                      placeholder="Godzina początkowa"
                      value={editedTripHours[trip.id]?.startTime || ""}
                      onChange={(e) => {
                        setEditedTripHours({
                          ...editedTripHours,
                          [trip.id]: { ...editedTripHours[trip.id], startTime: e.target.value, endTime: editedTripHours[trip.id]?.endTime || "" }
                        });
                      }}
                    />
                    <input
                      type="time"
                      className="rounded border border-slate-300 p-2"
                      placeholder="Godzina końcowa"
                      value={editedTripHours[trip.id]?.endTime || ""}
                      onChange={(e) => {
                        setEditedTripHours({
                          ...editedTripHours,
                          [trip.id]: { ...editedTripHours[trip.id], startTime: editedTripHours[trip.id]?.startTime || "", endTime: e.target.value }
                        });
                      }}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    disabled={tripBusyId === trip.id}
                    className="rounded bg-emerald-600 px-3 py-2 text-white disabled:opacity-50"
                    onClick={() => {
                      void decideTrip(trip.id, "APPROVED");
                    }}
                  >
                    Zatwierdz
                  </button>
                  {editedTripHours[trip.id] && editedTripHours[trip.id].startTime && editedTripHours[trip.id].endTime && (
                    <button
                      disabled={tripBusyId === trip.id}
                      className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
                      onClick={() => {
                        void decideTrip(trip.id, "ADJUSTED");
                      }}
                    >
                      Zaproponuj zmiane
                    </button>
                  )}
                  <button
                    disabled={tripBusyId === trip.id}
                    className="rounded bg-rose-600 px-3 py-2 text-white disabled:opacity-50"
                    onClick={() => {
                      void decideTrip(trip.id, "REJECTED");
                    }}
                  >
                    Odrzuc
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

        {user && canModerate && (
          <section className="space-y-4 rounded-xl bg-white p-5 shadow">
            <h2 className="text-lg font-semibold">Uzytkownicy i uprawnienia</h2>

            <div className="rounded border border-slate-200 p-4">
              <h3 className="mb-2 font-semibold">Dodaj nowego uzytkownika (szef/admin)</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  className="rounded border border-slate-300 p-2"
                  placeholder="Imie i nazwisko"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                />
                <input
                  className="rounded border border-slate-300 p-2"
                  placeholder="Email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                />
                <input
                  className="rounded border border-slate-300 p-2"
                  placeholder="Haslo"
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                />
                <select
                  className="rounded border border-slate-300 p-2"
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as AppRole)}
                >
                  {availableRolesForCreate.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
                {newUserRole === "EMPLOYEE" && (
                  <input
                    className="rounded border border-slate-300 p-2"
                    placeholder="ID kierownika (opcjonalnie)"
                    value={newUserManagerId}
                    onChange={(e) => setNewUserManagerId(e.target.value)}
                  />
                )}
              </div>
              <button
                disabled={usersBusy}
                className="mt-3 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
                onClick={() => {
                  void createUser();
                }}
              >
                Dodaj uzytkownika
              </button>
            </div>

            <div className="rounded border border-slate-200 p-4">
              <h3 className="mb-2 font-semibold">Edycja ustawien uzytkownika</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  className="rounded border border-slate-300 p-2"
                  value={selectedEditUserId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedEditUserId(value);

                    const selected = users.find((item) => item.id === Number(value));
                    if (!selected) {
                      setEditUserName("");
                      setEditUserEmail("");
                      setEditUserPassword("");
                      setEditUserManagerId("");
                      return;
                    }

                    setEditUserName(selected.name);
                    setEditUserEmail(selected.email);
                    setEditUserPassword("");
                    setEditUserManagerId(selected.managerId ? String(selected.managerId) : "");
                    setEditUserRole(selected.role);
                  }}
                >
                  <option value="">Wybierz uzytkownika</option>
                  {users.map((item) => (
                    <option key={item.id} value={String(item.id)}>
                      #{item.id} {item.name} ({roleLabel(item.role)})
                    </option>
                  ))}
                </select>
                {isAdmin && (
                  <select
                    className="rounded border border-slate-300 p-2"
                    value={editUserRole}
                    onChange={(e) => setEditUserRole(e.target.value as AppRole)}
                    disabled={!selectedEditUserId}
                  >
                    <option value="EMPLOYEE">Pracownik</option>
                    <option value="MANAGER">Kierownik</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                )}
                <input
                  className="rounded border border-slate-300 p-2"
                  placeholder="Imie i nazwisko"
                  value={editUserName}
                  onChange={(e) => setEditUserName(e.target.value)}
                  disabled={!selectedEditUserId}
                />
                <input
                  className="rounded border border-slate-300 p-2"
                  placeholder="Email"
                  value={editUserEmail}
                  onChange={(e) => setEditUserEmail(e.target.value)}
                  disabled={!selectedEditUserId}
                />
                <input
                  className="rounded border border-slate-300 p-2"
                  placeholder="Nowe haslo (opcjonalnie)"
                  type="password"
                  value={editUserPassword}
                  onChange={(e) => setEditUserPassword(e.target.value)}
                  disabled={!selectedEditUserId}
                />
                {users.find((item) => item.id === Number(selectedEditUserId))?.role === "EMPLOYEE" && (
                  <input
                    className="rounded border border-slate-300 p-2"
                    placeholder="ID kierownika"
                    value={editUserManagerId}
                    onChange={(e) => setEditUserManagerId(e.target.value)}
                    disabled={!selectedEditUserId}
                  />
                )}
              </div>
              <button
                disabled={usersBusy || !selectedEditUserId}
                className="mt-3 rounded bg-amber-700 px-4 py-2 text-white disabled:opacity-50"
                onClick={() => {
                  void updateUserSettings();
                }}
              >
                Zapisz ustawienia uzytkownika
              </button>
            </div>

            {isAdmin && (
              <div className="rounded border border-slate-200 p-4">
                <h3 className="mb-2 font-semibold">Zmien uprawnienia (administrator)</h3>
                <div className="grid gap-3 md:grid-cols-3">
                  <select
                    className="rounded border border-slate-300 p-2"
                    value={selectedPermissionUserId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedPermissionUserId(value);

                      const selected = users.find((item) => item.id === Number(value));
                      if (!selected) {
                        return;
                      }

                      setSelectedPermissionRole(selected.role);
                      setSelectedPermissionManagerId(selected.managerId ? String(selected.managerId) : "");
                    }}
                  >
                    <option value="">Wybierz uzytkownika</option>
                    {users.map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        #{item.id} {item.name} ({roleLabel(item.role)})
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded border border-slate-300 p-2"
                    value={selectedPermissionRole}
                    onChange={(e) => setSelectedPermissionRole(e.target.value as AppRole)}
                  >
                    <option value="EMPLOYEE">Pracownik</option>
                    <option value="MANAGER">Kierownik</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                  {selectedPermissionRole === "EMPLOYEE" && (
                    <input
                      className="rounded border border-slate-300 p-2"
                      placeholder="ID kierownika"
                      value={selectedPermissionManagerId}
                      onChange={(e) => setSelectedPermissionManagerId(e.target.value)}
                    />
                  )}
                </div>
                <button
                  disabled={usersBusy}
                  className="mt-3 rounded bg-indigo-700 px-4 py-2 text-white disabled:opacity-50"
                  onClick={() => {
                    void updatePermissions();
                  }}
                >
                  Zapisz uprawnienia
                </button>
              </div>
            )}

            <div className="overflow-x-auto rounded border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Imie</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Rola</th>
                    <th className="px-3 py-2">Kierownik</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((item) => (
                    <tr key={item.id} className="border-t border-slate-200">
                      <td className="px-3 py-2">{item.id}</td>
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2">{item.email}</td>
                      <td className="px-3 py-2">{roleLabel(item.role)}</td>
                      <td className="px-3 py-2">{item.managerId ?? "-"}</td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td className="px-3 py-2 text-slate-500" colSpan={5}>
                        Brak danych uzytkownikow.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {managerOptions.length > 0 && (
              <p className="text-xs text-slate-500">
                Dostepni kierownicy/admini (do przypisania pracownikow): {managerOptions.map((item) => item.id).join(", ")}
              </p>
            )}
          </section>
        )}

        {user && canModerate && (
          <section className="space-y-4 rounded-xl bg-white p-5 shadow">
            <h2 className="text-lg font-semibold">Konfiguracja poczty i komunikacji</h2>

            <h3 className="font-semibold">Poczta wychodzaca (SMTP)</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded border border-slate-300 p-2"
                placeholder="Serwer SMTP"
                value={mailSettings.smtpHost}
                onChange={(e) => setMailSettings((prev) => ({ ...prev, smtpHost: e.target.value }))}
              />
              <input
                className="rounded border border-slate-300 p-2"
                placeholder="Port SMTP"
                type="number"
                value={mailSettings.smtpPort}
                onChange={(e) =>
                  setMailSettings((prev) => ({ ...prev, smtpPort: Number(e.target.value) || 0 }))
                }
              />
              <input
                className="rounded border border-slate-300 p-2"
                placeholder="Uzytkownik SMTP"
                value={mailSettings.smtpUser}
                onChange={(e) => setMailSettings((prev) => ({ ...prev, smtpUser: e.target.value }))}
              />
              <input
                className="rounded border border-slate-300 p-2"
                placeholder="Adres nadawcy SMTP"
                value={mailSettings.smtpFrom}
                onChange={(e) => setMailSettings((prev) => ({ ...prev, smtpFrom: e.target.value }))}
              />
              <input
                className="rounded border border-slate-300 p-2"
                placeholder={mailSettings.smtpPassConfigured ? "Nowe haslo SMTP (opcjonalnie)" : "Haslo SMTP"}
                type="password"
                value={smtpPassInput}
                onChange={(e) => setSmtpPassInput(e.target.value)}
              />
            </div>

            <h3 className="font-semibold">Poczta przychodzaca (IMAP)</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded border border-slate-300 p-2"
                placeholder="Serwer IMAP"
                value={mailSettings.imapHost}
                onChange={(e) => setMailSettings((prev) => ({ ...prev, imapHost: e.target.value }))}
              />
              <input
                className="rounded border border-slate-300 p-2"
                placeholder="Port IMAP"
                type="number"
                value={mailSettings.imapPort}
                onChange={(e) =>
                  setMailSettings((prev) => ({ ...prev, imapPort: Number(e.target.value) || 0 }))
                }
              />
              <input
                className="rounded border border-slate-300 p-2"
                placeholder="Uzytkownik IMAP"
                value={mailSettings.imapUser}
                onChange={(e) => setMailSettings((prev) => ({ ...prev, imapUser: e.target.value }))}
              />
              <input
                className="rounded border border-slate-300 p-2"
                placeholder={mailSettings.imapPassConfigured ? "Nowe haslo IMAP (opcjonalnie)" : "Haslo IMAP"}
                type="password"
                value={imapPassInput}
                onChange={(e) => setImapPassInput(e.target.value)}
              />
              <label className="flex items-center gap-2 rounded border border-slate-300 p-2">
                <input
                  type="checkbox"
                  checked={mailSettings.imapSecure}
                  onChange={(e) => setMailSettings((prev) => ({ ...prev, imapSecure: e.target.checked }))}
                />
                Polaczenie bezpieczne IMAP (SSL/TLS)
              </label>

              <select
                className="rounded border border-slate-300 p-2"
                value={mailSettings.communicationMode}
                onChange={(e) =>
                  setMailSettings((prev) => ({
                    ...prev,
                    communicationMode: e.target.value as "MULTI" | "EMAIL_ONLY",
                  }))
                }
              >
                <option value="MULTI">Wiele kanalow (aplikacja + e-mail)</option>
                <option value="EMAIL_ONLY">Tylko e-mail</option>
              </select>
            </div>
            <button
              disabled={mailBusy}
              className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              onClick={() => {
                void saveMailSettings();
              }}
            >
              Zapisz konfiguracje poczty
            </button>
          </section>
        )}

        {error && <p className="rounded bg-rose-100 p-3 text-rose-700">{error}</p>}
      </main>
    </div>
  );
}

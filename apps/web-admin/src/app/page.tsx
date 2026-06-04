"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type User = {
  id: number;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
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

export default function Home() {
  const [email, setEmail] = useState("szef@firma.local");
  const [password, setPassword] = useState("szef123");
  const [comment, setComment] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [pending, setPending] = useState<LeaveRequest[]>([]);
  const [attachmentsByRequest, setAttachmentsByRequest] = useState<Record<number, Attachment[]>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [uploadBusyId, setUploadBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const canModerate = useMemo(() => user?.role === "MANAGER" || user?.role === "ADMIN", [user]);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    setPending([]);
    setAttachmentsByRequest({});
    setComment("");
  }, []);

  async function login() {
    setError("");
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
      const pendingRes = await fetch(`${API_URL}/leave-requests/pending`, {
        headers: {
          Authorization: `Bearer ${data.accessToken}`,
        },
      });
      if (pendingRes.ok) {
        const rows = (await pendingRes.json()) as LeaveRequest[];
        setPending(rows);
      }
    }
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [user, canModerate, loadPending, token]);

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
              Zalogowany: <strong>{user.name}</strong> ({user.role})
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

        {error && <p className="rounded bg-rose-100 p-3 text-rose-700">{error}</p>}
      </main>
    </div>
  );
}

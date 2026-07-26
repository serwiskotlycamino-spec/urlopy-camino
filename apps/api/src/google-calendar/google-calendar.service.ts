import { Injectable, Logger } from '@nestjs/common';
import { createSign } from 'crypto';
import { DatabaseService } from '../database/database.service';

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
};

type LeaveCalendarPayload = {
  leaveRequestId: number;
  userName: string;
  userEmail: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  managerComment: string | null;
};

type LeaveCalendarMapRow = {
  google_event_id: string;
};

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly calendarId = (process.env.GOOGLE_CALENDAR_ID ?? '').trim();
  private readonly timezone = (process.env.GOOGLE_CALENDAR_TIMEZONE ?? 'Europe/Warsaw').trim();
  private readonly titlePrefix = (process.env.GOOGLE_CALENDAR_LEAVE_TITLE_PREFIX ?? 'Urlop').trim();

  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(private readonly db: DatabaseService) {}

  isEnabled(): boolean {
    return this.calendarId.length > 0 && this.getServiceAccount() !== null;
  }

  async upsertApprovedLeave(payload: LeaveCalendarPayload): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const existingEventId = await this.getEventIdForLeave(payload.leaveRequestId);
    if (existingEventId) {
      await this.updateEvent(existingEventId, payload);
      return;
    }

    const eventId = await this.createEvent(payload);
    await this.saveLeaveEventMapping(payload.leaveRequestId, eventId);
  }

  async deleteLeaveEvent(leaveRequestId: number): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const eventId = await this.getEventIdForLeave(leaveRequestId);
    if (!eventId) {
      return;
    }

    try {
      await this.callCalendarApi(`events/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
      });
    } catch (error) {
      this.logger.warn(`Nie udalo sie usunac eventu Google dla wniosku #${leaveRequestId}: ${String(error)}`);
    }

    await this.deleteLeaveEventMapping(leaveRequestId);
  }

  private async createEvent(payload: LeaveCalendarPayload): Promise<string> {
    const body = this.buildEventBody(payload);
    const response = await this.callCalendarApi<{ id: string }>('events', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!response.id) {
      throw new Error('Brak id eventu Google Calendar po utworzeniu wpisu.');
    }

    return response.id;
  }

  private async updateEvent(eventId: string, payload: LeaveCalendarPayload): Promise<void> {
    const body = this.buildEventBody(payload);
    await this.callCalendarApi(`events/${encodeURIComponent(eventId)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  private buildEventBody(payload: LeaveCalendarPayload): Record<string, unknown> {
    const leaveTypeLabel = this.getLeaveTypeLabel(payload.leaveType);
    const summary = `${this.titlePrefix}: ${payload.userName}`;

    const descriptionLines = [
      `Pracownik: ${payload.userName}`,
      `Email: ${payload.userEmail}`,
      `Typ: ${leaveTypeLabel}`,
      `Zakres: ${payload.startDate} - ${payload.endDate}`,
      `Powod: ${payload.reason ?? '-'}`,
      `Komentarz przelozonego: ${payload.managerComment ?? '-'}`,
      `Wniosek ID: ${payload.leaveRequestId}`,
    ];

    return {
      summary,
      description: descriptionLines.join('\n'),
      colorId: this.getColorId(payload.leaveType),
      start: {
        date: payload.startDate,
        timeZone: this.timezone,
      },
      end: {
        date: this.getExclusiveEndDate(payload.endDate),
        timeZone: this.timezone,
      },
      transparency: 'opaque',
      extendedProperties: {
        private: {
          leaveRequestId: String(payload.leaveRequestId),
          leaveType: payload.leaveType,
        },
      },
    };
  }

  private getExclusiveEndDate(endDate: string): string {
    const parsed = new Date(`${endDate}T00:00:00.000Z`);
    parsed.setUTCDate(parsed.getUTCDate() + 1);
    return parsed.toISOString().slice(0, 10);
  }

  private getColorId(leaveType: string): string {
    const map: Record<string, string> = {
      ANNUAL: '11',
      ON_DEMAND: '11',
      SICK: '4',
      UNPAID: '8',
      OTHER: '5',
    };

    return map[leaveType] ?? '11';
  }

  private getLeaveTypeLabel(leaveType: string): string {
    const map: Record<string, string> = {
      ANNUAL: 'Urlop roczny',
      ON_DEMAND: 'Urlop na zadanie',
      SICK: 'Urlop chorobowy',
      UNPAID: 'Urlop bezplatny',
      OTHER: 'Inny',
    };

    return map[leaveType] ?? leaveType;
  }

  private async getEventIdForLeave(leaveRequestId: number): Promise<string | null> {
    const row = await this.db.get<LeaveCalendarMapRow>(
      'SELECT google_event_id FROM leave_request_google_events WHERE leave_request_id = $1',
      [leaveRequestId],
    );

    return row?.google_event_id ?? null;
  }

  private async saveLeaveEventMapping(leaveRequestId: number, eventId: string): Promise<void> {
    await this.db.run(
      `INSERT INTO leave_request_google_events (leave_request_id, google_event_id, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (leave_request_id)
       DO UPDATE SET google_event_id = EXCLUDED.google_event_id, updated_at = NOW()`,
      [leaveRequestId, eventId],
    );
  }

  private async deleteLeaveEventMapping(leaveRequestId: number): Promise<void> {
    await this.db.run('DELETE FROM leave_request_google_events WHERE leave_request_id = $1', [leaveRequestId]);
  }

  private async callCalendarApi<T>(path: string, options: RequestInit): Promise<T> {
    const token = await this.getAccessToken();
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google Calendar API error ${response.status}: ${text}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 30_000) {
      return this.accessToken;
    }

    const serviceAccount = this.getServiceAccount();
    if (!serviceAccount) {
      throw new Error('Brak konfiguracji konta serwisowego Google Calendar.');
    }

    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/calendar',
      aud: serviceAccount.token_uri ?? 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };

    const assertion = this.signJwt(claims, serviceAccount.private_key);
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });

    const response = await fetch(serviceAccount.token_uri ?? 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google OAuth token error ${response.status}: ${text}`);
    }

    const token = (await response.json()) as GoogleTokenResponse;
    this.accessToken = token.access_token;
    this.accessTokenExpiresAt = Date.now() + token.expires_in * 1000;

    return token.access_token;
  }

  private signJwt(claims: Record<string, unknown>, privateKey: string): string {
    const header = { alg: 'RS256', typ: 'JWT' };
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(claims));
    const data = `${encodedHeader}.${encodedPayload}`;

    const signer = createSign('RSA-SHA256');
    signer.update(data);
    signer.end();

    const signature = signer.sign(privateKey);
    const encodedSignature = this.base64UrlEncode(signature);

    return `${data}.${encodedSignature}`;
  }

  private base64UrlEncode(value: string | Buffer): string {
    return Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private getServiceAccount(): GoogleServiceAccount | null {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<GoogleServiceAccount>;
      if (!parsed.client_email || !parsed.private_key) {
        return null;
      }

      return {
        client_email: parsed.client_email,
        private_key: parsed.private_key,
        token_uri: parsed.token_uri,
      };
    } catch {
      return null;
    }
  }
}

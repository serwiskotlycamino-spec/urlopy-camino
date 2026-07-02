import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RealtimeService } from '../realtime/realtime.service';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import admin from 'firebase-admin';

type NotificationRow = {
  id: number;
  user_id: number;
  channel: 'IN_APP' | 'EMAIL' | 'PUSH';
  event: string;
  message: string;
  payload: Record<string, unknown> | null;
  status: 'SENT' | 'FAILED';
  created_at: string;
};

type UserContact = {
  email: string;
  device_token: string | null;
};

type AppSettingRow = {
  key: string;
  value: string;
};

type ResolvedMailSettings = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  communicationMode: 'MULTI' | 'EMAIL_ONLY';
};

function eventTitle(event: string): string {
  switch (event) {
    case 'leave.request.created':
      return 'Nowy wniosek urlopowy';
    case 'leave.request.approved':
      return 'Wniosek urlopowy zatwierdzony';
    case 'leave.request.rejected':
      return 'Wniosek urlopowy odrzucony';
    case 'leave.request.cancelled':
      return 'Wniosek urlopowy anulowany';
    case 'work.trip.approved':
      return 'Godziny wyjazdowe zatwierdzone';
    case 'work.trip.rejected':
      return 'Godziny wyjazdowe odrzucone';
    case 'work.trip.adjusted':
      return 'Godziny wyjazdowe skorygowane';
    case 'work.trip.created':
      return 'Nowe godziny wyjazdowe';
    default:
      return 'Powiadomienie';
  }
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly realtime: RealtimeService,
  ) {
    this.tryInitFirebase();
  }

  async createInApp(
    userId: number,
    event: string,
    message: string,
    payload: Record<string, unknown>,
  ) {
    await this.db.run(
      `INSERT INTO notifications (user_id, channel, event, message, payload, status)
       VALUES ($1, 'IN_APP', $2, $3, $4, 'SENT')`,
      [userId, event, message, payload],
    );

    this.realtime.publish({
      userId,
      type: event,
      payload: { message, payload },
    });

    await this.createPush(userId, event, message, payload);
  }

  async createEmailFallback(
    userId: number,
    event: string,
    message: string,
    payload: Record<string, unknown>,
  ) {
    const settings = await this.resolveMailSettings();
    const mailer = this.createMailer(settings);

    const contact = await this.db.get<UserContact>('SELECT email, device_token FROM users WHERE id = $1', [
      userId,
    ]);

    const canSend = Boolean(mailer && contact?.email);
    let status: 'SENT' | 'FAILED' = canSend ? 'SENT' : 'FAILED';

    if (canSend && mailer && contact) {
      try {
        await mailer.sendMail({
          from: settings.smtpFrom,
          to: contact.email,
          subject: `[Program Urlopowy] ${eventTitle(event)}`,
          text: `${message}\n\nPayload: ${JSON.stringify(payload)}`,
        });
      } catch {
        status = 'FAILED';
      }
    }

    await this.db.run(
      `INSERT INTO notifications (user_id, channel, event, message, payload, status)
       VALUES ($1, 'EMAIL', $2, $3, $4, $5)`,
      [userId, event, message, payload, status],
    );
  }

  private async createPush(
    userId: number,
    event: string,
    message: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const contact = await this.db.get<UserContact>('SELECT email, device_token FROM users WHERE id = $1', [
      userId,
    ]);

    if (!contact?.device_token) {
      this.logger.warn(`Brak device_token dla userId=${userId}. Push nie zostal wyslany.`);
      await this.db.run(
        `INSERT INTO notifications (user_id, channel, event, message, payload, status)
         VALUES ($1, 'PUSH', $2, $3, $4, 'FAILED')`,
        [userId, event, message, payload],
      );
      return;
    }

    let status: 'SENT' | 'FAILED' = 'SENT';
    try {
      await admin.messaging().send({
        token: contact.device_token,
        notification: {
          title: eventTitle(event),
          body: message,
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'default',
          },
        },
        data: {
          event,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      this.logger.error(
        `Blad wysylki PUSH dla userId=${userId}, event=${event}: ${errorMessage}`,
      );
      status = 'FAILED';
    }

    await this.db.run(
      `INSERT INTO notifications (user_id, channel, event, message, payload, status)
       VALUES ($1, 'PUSH', $2, $3, $4, $5)`,
      [userId, event, message, payload, status],
    );
  }

  async getForUser(userId: number, afterId?: number) {
    const rows = await this.db.all<NotificationRow>(
      `SELECT * FROM notifications
        WHERE user_id = $1 AND ($2::int IS NULL OR id > $3)
       ORDER BY id DESC
       LIMIT 50`,
      [userId, afterId ?? null, afterId ?? null],
    );

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      channel: row.channel,
      event: row.event,
      message: row.message,
      payload: row.payload,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  private createMailer(settings: ResolvedMailSettings): Transporter | null {
    if (!settings.smtpHost || !settings.smtpPort || !settings.smtpUser || !settings.smtpPass) {
      return null;
    }

    return nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpPort === 465,
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPass,
      },
    });
  }

  private async resolveMailSettings(): Promise<ResolvedMailSettings> {
    const rows = await this.db.all<AppSettingRow>(
      `SELECT key, value
       FROM app_settings
       WHERE key LIKE 'mail.%' OR key = 'communication_mode'`,
    );

    const map = rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    return {
      smtpHost: map['mail.smtpHost'] ?? process.env.SMTP_HOST ?? '',
      smtpPort: Number(map['mail.smtpPort'] ?? process.env.SMTP_PORT ?? '0'),
      smtpUser: map['mail.smtpUser'] ?? process.env.SMTP_USER ?? '',
      smtpPass: map['mail.smtpPass'] ?? process.env.SMTP_PASS ?? '',
      smtpFrom: map['mail.smtpFrom'] ?? process.env.SMTP_FROM ?? 'serwis@kotlycamino.pl',
      communicationMode:
        (map.communication_mode ?? process.env.COMMUNICATION_MODE ?? 'MULTI').toUpperCase() === 'EMAIL_ONLY'
          ? 'EMAIL_ONLY'
          : 'MULTI',
    };
  }

  private tryInitFirebase(): void {
    if (admin.apps.length > 0) {
      return;
    }

    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountRaw) {
      this.logger.warn('Brak FIREBASE_SERVICE_ACCOUNT_JSON. Wysylka PUSH bedzie pomijana.');
      return;
    }

    try {
      const serviceAccount = JSON.parse(serviceAccountRaw) as admin.ServiceAccount;
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`Nie udalo sie zainicjalizowac Firebase Admin SDK: ${errorMessage}`);
    }
  }
}

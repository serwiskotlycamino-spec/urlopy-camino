import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { OneDriveService } from '../onedrive/onedrive.service';
import type { AuthUser } from '../auth/types';

type DbLeaveRequest = {
  id: number;
  user_id: number;
  manager_id: number | null;
};

type DbAttachment = {
  id: number;
  leave_request_id: number;
  uploaded_by: number;
  file_name: string;
  one_drive_item_id: string;
  one_drive_web_url: string;
  file_size: number;
  created_at: string;
};

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly oneDriveService: OneDriveService,
  ) {}

  async create(input: {
    user: AuthUser;
    leaveRequestId: number;
    fileName: string;
    contentBase64: string;
  }) {
    const request = await this.getLeaveRequestOrThrow(input.leaveRequestId);
    this.ensureCanAccessRequest(input.user, request);

    const buffer = Buffer.from(input.contentBase64, 'base64');
    const uploaded = await this.oneDriveService.uploadAttachment({
      leaveRequestId: input.leaveRequestId,
      fileName: input.fileName,
      content: buffer,
    });

    const created = await this.db.get<{ id: number }>(
      `INSERT INTO leave_request_attachments
      (leave_request_id, uploaded_by, file_name, one_drive_item_id, one_drive_web_url, file_size)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [
        input.leaveRequestId,
        input.user.id,
        uploaded.name,
        uploaded.id,
        uploaded.webUrl,
        uploaded.size,
      ],
    );

    if (!created) {
      throw new NotFoundException('Nie udalo sie zapisac zalacznika.');
    }

    return this.getById(created.id);
  }

  async getForLeaveRequest(user: AuthUser, leaveRequestId: number) {
    const request = await this.getLeaveRequestOrThrow(leaveRequestId);
    this.ensureCanAccessRequest(user, request);

    return this.db.all<DbAttachment>(
      `SELECT * FROM leave_request_attachments
       WHERE leave_request_id = $1
       ORDER BY created_at DESC`,
      [leaveRequestId],
    );
  }

  private async getById(id: number) {
    const row = await this.db.get<DbAttachment>('SELECT * FROM leave_request_attachments WHERE id = $1', [
      id,
    ]);

    if (!row) {
      throw new NotFoundException('Nie znaleziono zalacznika.');
    }

    return row;
  }

  private async getLeaveRequestOrThrow(id: number) {
    const request = await this.db.get<DbLeaveRequest>(
      'SELECT id, user_id, manager_id FROM leave_requests WHERE id = $1',
      [id],
    );

    if (!request) {
      throw new NotFoundException('Nie znaleziono wniosku urlopowego.');
    }

    return request;
  }

  private ensureCanAccessRequest(user: AuthUser, request: DbLeaveRequest) {
    if (user.role === 'ADMIN') {
      return;
    }

    if (user.role === 'MANAGER' && request.manager_id === user.id) {
      return;
    }

    if (user.role === 'EMPLOYEE' && request.user_id === user.id) {
      return;
    }

    throw new ForbiddenException('Brak dostepu do zalacznikow tego wniosku.');
  }
}

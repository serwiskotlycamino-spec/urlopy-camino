import { Injectable, ServiceUnavailableException } from '@nestjs/common';

type GraphUploadResponse = {
  id: string;
  name: string;
  size: number;
  webUrl: string;
};

@Injectable()
export class OneDriveService {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  private readonly tenantId = process.env.MS_TENANT_ID ?? '';
  private readonly clientId = process.env.MS_CLIENT_ID ?? '';
  private readonly clientSecret = process.env.MS_CLIENT_SECRET ?? '';
  private readonly driveId = process.env.ONEDRIVE_DRIVE_ID ?? '';
  private readonly basePath = process.env.ONEDRIVE_BASE_PATH ?? 'urlopy';

  async uploadAttachment(input: {
    leaveRequestId: number;
    fileName: string;
    content: Buffer;
  }): Promise<GraphUploadResponse> {
    this.ensureConfigured();

    const token = await this.getAccessToken();
    const safeFileName = this.sanitizeFileName(input.fileName);
    const remotePath = `${this.basePath}/leave-request-${input.leaveRequestId}/${safeFileName}`;

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${this.driveId}/root:/${encodeURI(remotePath)}:/content`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(input.content),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new ServiceUnavailableException(`Blad uploadu OneDrive: ${response.status} ${text}`);
    }

    return (await response.json()) as GraphUploadResponse;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 30_000) {
      return this.accessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ServiceUnavailableException(`Blad tokenu Microsoft Graph: ${response.status} ${text}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.accessTokenExpiresAt = Date.now() + data.expires_in * 1000;

    return data.access_token;
  }

  private ensureConfigured(): void {
    if (!this.tenantId || !this.clientId || !this.clientSecret || !this.driveId) {
      throw new ServiceUnavailableException(
        'OneDrive nie jest skonfigurowany. Ustaw MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, ONEDRIVE_DRIVE_ID.',
      );
    }
  }

  private sanitizeFileName(value: string): string {
    return value.replace(/[\\/:*?"<>|]/g, '_').trim();
  }
}

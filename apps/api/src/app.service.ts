import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'urlopy-api',
      timestamp: new Date().toISOString(),
    };
  }
}

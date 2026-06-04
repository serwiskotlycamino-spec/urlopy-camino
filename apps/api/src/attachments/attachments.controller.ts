import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/types';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';

@Controller('attachments')
@UseGuards(AuthGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAttachmentDto) {
    return this.attachmentsService.create({
      user,
      leaveRequestId: body.leaveRequestId,
      fileName: body.fileName,
      contentBase64: body.contentBase64,
    });
  }

  @Get('leave-request/:id')
  getForLeaveRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.attachmentsService.getForLeaveRequest(user, Number(id));
  }
}

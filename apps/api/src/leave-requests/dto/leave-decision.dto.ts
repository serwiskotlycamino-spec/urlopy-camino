import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class LeaveDecisionDto {
  @IsIn(['APPROVED', 'REJECTED', 'PENDING', 'CANCELLED'])
  decision!: 'APPROVED' | 'REJECTED' | 'PENDING' | 'CANCELLED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

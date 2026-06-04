import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class LeaveDecisionDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

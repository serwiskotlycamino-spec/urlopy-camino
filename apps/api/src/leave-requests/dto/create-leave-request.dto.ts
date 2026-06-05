import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLeaveRequestDto {
  @IsIn(['ANNUAL', 'ON_DEMAND', 'SICK', 'UNPAID', 'OTHER'])
  leaveType!: 'ANNUAL' | 'ON_DEMAND' | 'SICK' | 'UNPAID' | 'OTHER';

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

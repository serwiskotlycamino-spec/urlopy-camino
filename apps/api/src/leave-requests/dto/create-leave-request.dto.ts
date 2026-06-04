import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLeaveRequestDto {
  @IsIn(['ANNUAL', 'ON_DEMAND', 'SICK', 'UNPAID'])
  leaveType!: 'ANNUAL' | 'ON_DEMAND' | 'SICK' | 'UNPAID';

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

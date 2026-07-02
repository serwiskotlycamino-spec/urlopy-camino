import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateWorkTripHoursDto {
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  destination?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
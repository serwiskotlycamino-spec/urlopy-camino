import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ReviewWorkTripDto {
  @IsIn(['APPROVED', 'REJECTED', 'ADJUSTED'])
  decision!: 'APPROVED' | 'REJECTED' | 'ADJUSTED';

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
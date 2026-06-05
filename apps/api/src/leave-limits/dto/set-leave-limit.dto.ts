import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class SetLeaveLimitDto {
  @IsInt()
  @Min(0)
  @Max(365)
  annualDays!: number;

  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;
}

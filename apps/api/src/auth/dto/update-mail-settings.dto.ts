import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateMailSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpHost?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  smtpPort?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpUser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  smtpPass?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  imapHost?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  imapPort?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  imapUser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imapPass?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  imapSecure?: number;

  @IsOptional()
  @IsIn(['MULTI', 'EMAIL_ONLY'])
  communicationMode?: 'MULTI' | 'EMAIL_ONLY';
}

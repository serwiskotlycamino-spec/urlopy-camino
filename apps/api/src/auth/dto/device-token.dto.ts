import { IsString, MinLength } from 'class-validator';

export class DeviceTokenDto {
  @IsString()
  @MinLength(20)
  token!: string;
}

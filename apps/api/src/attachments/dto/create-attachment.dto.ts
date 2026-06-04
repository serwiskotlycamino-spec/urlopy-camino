import { IsBase64, IsInt, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAttachmentDto {
  @IsInt()
  leaveRequestId!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(180)
  fileName!: string;

  @IsBase64()
  contentBase64!: string;
}

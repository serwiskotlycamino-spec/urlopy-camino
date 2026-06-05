import { IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(4)
  password!: string;

  @IsIn(['ADMIN', 'EMPLOYEE'])
  role!: 'ADMIN' | 'EMPLOYEE';

  @IsOptional()
  @IsInt()
  @Min(1)
  managerId?: number;
}

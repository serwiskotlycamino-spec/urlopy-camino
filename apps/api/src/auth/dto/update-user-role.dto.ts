import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateUserRoleDto {
  @IsIn(['ADMIN', 'EMPLOYEE'])
  role!: 'ADMIN' | 'EMPLOYEE';

  @IsOptional()
  @IsInt()
  @Min(1)
  managerId?: number;
}

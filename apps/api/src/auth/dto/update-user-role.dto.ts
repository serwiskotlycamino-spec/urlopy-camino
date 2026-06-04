import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateUserRoleDto {
  @IsIn(['ADMIN', 'MANAGER', 'EMPLOYEE'])
  role!: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

  @IsOptional()
  @IsInt()
  @Min(1)
  managerId?: number;
}

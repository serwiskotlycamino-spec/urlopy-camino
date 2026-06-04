export type AppRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

export type AuthUser = {
  id: number;
  email: string;
  role: AppRole;
  managerId: number | null;
};

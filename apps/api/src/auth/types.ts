export type AppRole = 'ADMIN' | 'EMPLOYEE';

export type AuthUser = {
  id: number;
  email: string;
  role: AppRole;
  managerId: number | null;
};

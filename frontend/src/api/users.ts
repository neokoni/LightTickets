import { apiFetch } from './client';
import type { AssignableUser } from '@/types/user';

export function apiGetAssignableUsers() {
  return apiFetch<AssignableUser[]>('/users/assignable');
}

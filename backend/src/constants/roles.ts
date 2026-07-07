export const ROLE = {
  PLAYER: 'player',
  STAFF: 'staff',
  ADMIN: 'admin',
} as const;

export type AppRole = (typeof ROLE)[keyof typeof ROLE];

const STAFF_ROLES: readonly string[] = [ROLE.STAFF, ROLE.ADMIN];

export function isStaffRole(role: string): boolean {
  return STAFF_ROLES.includes(role);
}

export function isAdminRole(role: string): boolean {
  return role === ROLE.ADMIN;
}

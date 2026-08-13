import { t } from '@/i18n';

interface DisplayUser {
  username: string;
  deletedAt?: string | null;
}

export function userDisplayName(user: DisplayUser): string {
  return user.deletedAt ? t('user.deleted') : user.username;
}

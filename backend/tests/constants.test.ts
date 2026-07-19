import { describe, it, expect } from 'vitest';
import {
  USER_PUBLIC_SELECT,
  USER_BRIEF_SELECT,
  USER_BRIEF_WITH_AVATAR,
  TICKET_INCLUDE_BASE,
  TICKET_INCLUDE_DETAIL,
} from '../src/services/constants.js';
import { ROLE, isAdminRole, isStaffRole } from '../src/constants/roles.js';
import { TICKET_STATUS, canTransitionTicketStatus } from '../src/constants/ticket-status.js';
import { TEMPLATE_HIDDEN_MODE } from '../src/constants/ticket-visibility.js';
import { ALLOWED_MIME_TYPES } from '../src/constants/upload.js';

describe('USER_PUBLIC_SELECT', () => {
  it('contains the 9 public user fields', () => {
    const keys = Object.keys(USER_PUBLIC_SELECT).sort();
    expect(keys).toEqual(
      [
        'avatarUrl',
        'createdAt',
        'email',
        'id',
        'minecraftName',
        'minecraftUuid',
        'role',
        'updatedAt',
        'username',
      ].sort(),
    );
  });

  it('all values are true', () => {
    for (const v of Object.values(USER_PUBLIC_SELECT)) {
      expect(v).toBe(true);
    }
  });
});

describe('TICKET_INCLUDE_BASE', () => {
  it('includes author and labels', () => {
    expect(TICKET_INCLUDE_BASE).toHaveProperty('author');
    expect(TICKET_INCLUDE_BASE).toHaveProperty('labels');
  });

  it('author select has id/username/minecraftName', () => {
    const author = TICKET_INCLUDE_BASE.author as { select: Record<string, boolean> };
    expect(author.select).toEqual({
      id: true,
      username: true,
      minecraftName: true,
    });
  });
});

describe('TICKET_INCLUDE_DETAIL', () => {
  it('includes author, assignees, labels, _count', () => {
    expect(TICKET_INCLUDE_DETAIL).toHaveProperty('author');
    expect(TICKET_INCLUDE_DETAIL).toHaveProperty('assignees');
    expect(TICKET_INCLUDE_DETAIL).toHaveProperty('labels');
    expect(TICKET_INCLUDE_DETAIL).toHaveProperty('_count');
  });

  it('_count selects comments', () => {
    const count = TICKET_INCLUDE_DETAIL._count as { select: Record<string, boolean> };
    expect(count.select).toEqual({ comments: true });
  });
});

describe('USER_BRIEF_SELECT', () => {
  it('contains id/username/minecraftName', () => {
    expect(USER_BRIEF_SELECT).toEqual({
      id: true,
      username: true,
      minecraftName: true,
    });
  });
});

describe('USER_BRIEF_WITH_AVATAR', () => {
  it('contains id/username/minecraftName/minecraftUuid/avatarUrl', () => {
    expect(USER_BRIEF_WITH_AVATAR).toEqual({
      id: true,
      username: true,
      minecraftName: true,
      minecraftUuid: true,
      avatarUrl: true,
    });
  });

  it('TICKET_INCLUDE_BASE author uses USER_BRIEF_SELECT', () => {
    expect(TICKET_INCLUDE_BASE.author).toEqual({ select: USER_BRIEF_SELECT });
  });
});

describe('ROLE', () => {
  it('defines the three user roles in one place', () => {
    expect(ROLE).toEqual({ PLAYER: 'player', STAFF: 'staff', ADMIN: 'admin' });
  });

  it('recognizes staff-level roles', () => {
    expect(isStaffRole('player')).toBe(false);
    expect(isStaffRole('staff')).toBe(true);
    expect(isStaffRole('admin')).toBe(true);
  });

  it('recognizes admin role only', () => {
    expect(isAdminRole('player')).toBe(false);
    expect(isAdminRole('staff')).toBe(false);
    expect(isAdminRole('admin')).toBe(true);
  });
});

describe('TICKET_STATUS', () => {
  it('defines the supported ticket statuses', () => {
    expect(TICKET_STATUS).toEqual({
      OPEN: 'open',
      IN_PROGRESS: 'in_progress',
      CLOSED: 'closed',
      INVALID: 'invalid',
    });
  });

  it('allows current player-facing status transitions', () => {
    expect(canTransitionTicketStatus('open', 'closed')).toBe(true);
    expect(canTransitionTicketStatus('closed', 'open')).toBe(true);
    expect(canTransitionTicketStatus('in_progress', 'closed')).toBe(true);
  });

  it('does not allow unsupported transition targets', () => {
    expect(canTransitionTicketStatus('open', 'invalid')).toBe(false);
    expect(canTransitionTicketStatus('closed', 'invalid')).toBe(false);
  });
});

describe('TEMPLATE_HIDDEN_MODE', () => {
  it('defines forced and creator-selected visibility policies', () => {
    expect(TEMPLATE_HIDDEN_MODE).toEqual({ HIDDEN: true, PUBLIC: false, OPTIONAL: 'optional' });
  });
});

describe('ALLOWED_MIME_TYPES', () => {
  it('contains the upload MIME allowlist', () => {
    expect(ALLOWED_MIME_TYPES).toEqual([
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
    ]);
  });
});

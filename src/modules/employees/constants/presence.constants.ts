export interface OnlineUser {
  userId: string;
  employeeId?: string;
  fullName: string;
  initials: string;
  avatarColor: string;
}

export const AVATAR_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ef4444',
] as const;

export function getAvatarColor(userId: string): string {
  const suffix = userId.slice(-2);
  const numeric = parseInt(suffix, 16);
  const index = Number.isNaN(numeric) ? 0 : numeric % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

export function getInitials(fullName?: string): string {
  if (!fullName) return '??';
  return fullName
    .split(' ')
    .map((chunk) => chunk[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

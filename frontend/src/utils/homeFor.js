export function homeFor(role) {
  if (role === 'super_admin') return '/super/health';
  if (role === 'assistant') return '/collect';
  if (role === 'hall_admin') return '/lodge';
  if (role === 'porter') return '/lodge/desk';
  return '/app';
}

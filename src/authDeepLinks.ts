/** Extract a Better Auth password-reset token from its callback URL. */
export function getPasswordResetTokenFromUrl(url: string): string | null {
  if (!url.includes('reset-password')) return null;
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const params = new URLSearchParams(query);
  return params.get('token') || params.get('code');
}

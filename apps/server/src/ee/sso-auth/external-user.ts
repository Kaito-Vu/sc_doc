/**
 * Users created by SSO/SCIM/LDAP get a random password flagged
 * hasGeneratedPassword. Only changePassword/passwordReset clear that flag,
 * and both are blocked for these users, so the flag means "identity is owned
 * by the provider": no local login, no password change/reset.
 */
export const isExternallyManaged = (user?: {
  hasGeneratedPassword?: boolean | null;
}): boolean => !!user?.hasGeneratedPassword;

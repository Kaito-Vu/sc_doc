export interface LoginContext {
  method: 'local' | 'oidc' | 'ldap' | 'saml';
  providerId?: string;
  providerName?: string;
}

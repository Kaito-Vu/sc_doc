import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LdapLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  username: string;

  // Non-empty is security-critical: an empty password makes many LDAP
  // servers perform an unauthenticated bind that "succeeds" (RFC 4513 5.1.2).
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password: string;
}

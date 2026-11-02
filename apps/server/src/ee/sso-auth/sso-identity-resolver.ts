import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { KyselyTransaction } from '@docmost/db/types/kysely.types';
import { User } from '@docmost/db/types/entity.types';
import { AuthAccountRepo } from '../sso/auth-account.repo';
import { SsoUserProvisioningService } from './sso-user-provisioning.service';

export type SsoProfile = {
  jobTitle?: string;
  department?: string;
  employeeId?: string;
};

/**
 * Identity decisions shared by OIDC and directory (LDAP) logins: link lookup
 * -> (optional) email_verified gate -> email match -> provision, then link the
 * authAccount.
 *
 * All identity paths reject: an account linked to another subject of the same
 * provider, an account linked to a DIFFERENT provider (never claimed by
 * email), and deactivated/deleted users (checked before any link is written,
 * and never re-provisioned over).
 *
 * Legacy LDAP users have no authAccount row: they match by email and get
 * linked on their next login, so they keep working.
 */
@Injectable()
export class SsoIdentityResolver {
  constructor(
    private readonly userRepo: UserRepo,
    private readonly authAccountRepo: AuthAccountRepo,
    private readonly userProvisioning: SsoUserProvisioningService,
  ) {}

  async resolve(
    params: {
      email: string;
      name?: string;
      providerUserId: string;
      provider: { id: string; allowSignup: boolean };
      workspaceId: string;
      /** OIDC: pass the IdP's email_verified; an explicit false blocks email match/provisioning. */
      emailVerified?: boolean;
      /** Profile attributes from the IdP, synced onto the user on every login. */
      profile?: SsoProfile;
    },
    trx: KyselyTransaction,
  ): Promise<User> {
    const {
      email,
      name,
      providerUserId,
      provider,
      workspaceId,
      emailVerified,
      profile,
    } = params;

    const linked = await this.authAccountRepo.findByProviderUserId(
      provider.id,
      providerUserId,
      workspaceId,
      trx,
    );
    let user: User | undefined = linked
      ? await this.userRepo.findById(linked.userId, workspaceId, { trx })
      : undefined;

    if (!user && emailVerified === false) {
      throw new UnauthorizedException('SSO email address is not verified');
    }

    if (!user) {
      user = await this.userRepo.findByEmail(email, workspaceId, { trx });
      if (user) {
        this.assertActive(user);
        const sameProvider = await this.authAccountRepo.findByUserAndProvider(
          user.id,
          provider.id,
          trx,
        );
        if (sameProvider && sameProvider.providerUserId !== providerUserId) {
          throw new UnauthorizedException(
            'Account is linked to a different SSO identity',
          );
        }
        // ponytail: findByUserId ignores trx and returns any one link; fine
        // as an existence check.
        if (
          !sameProvider &&
          (await this.authAccountRepo.findByUserId(user.id, workspaceId))
        ) {
          throw new UnauthorizedException(
            'Account is linked to a different SSO provider',
          );
        }
      }
    }

    if (user) this.assertActive(user);

    if (!user) {
      if (!provider.allowSignup) {
        throw new UnauthorizedException('User not provisioned');
      }
      user = await this.userProvisioning.provision(
        { email, name, workspaceId },
        trx,
      );
    }

    await this.authAccountRepo.upsert(
      {
        userId: user.id,
        authProviderId: provider.id,
        providerUserId,
        workspaceId,
      },
      trx,
    );
    return this.syncProfile(user, name, profile, trx);
  }

  /** Only overwrites with non-empty values, so a missing claim never blanks a field. */
  private async syncProfile(
    user: User,
    name: string | undefined,
    profile: SsoProfile | undefined,
    trx: KyselyTransaction,
  ): Promise<User> {
    const patch: Partial<User> = {};
    const set = (key: keyof SsoProfile | 'name', value?: string) => {
      const v = value?.trim();
      if (v && v !== user[key]) (patch as any)[key] = v;
    };
    // The OIDC strategy falls back to the email when the IdP has no name claim.
    if (name !== user.email) set('name', name);
    set('jobTitle', profile?.jobTitle);
    set('department', profile?.department);
    set('employeeId', profile?.employeeId);
    if (!Object.keys(patch).length) return user;

    await this.userRepo.updateUser(patch, user.id, user.workspaceId, trx);
    return { ...user, ...patch };
  }

  private assertActive(user: User) {
    if (user.deletedAt || user.deactivatedAt) {
      throw new UnauthorizedException('User account is disabled');
    }
  }
}

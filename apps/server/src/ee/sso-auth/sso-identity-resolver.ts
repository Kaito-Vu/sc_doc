import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { KyselyTransaction } from '@docmost/db/types/kysely.types';
import { User } from '@docmost/db/types/entity.types';
import { AuthAccountRepo } from '../sso/auth-account.repo';
import { SsoUserProvisioningService } from './sso-user-provisioning.service';

/**
 * Identity decisions for directory (LDAP) logins: link lookup -> email match
 * -> provision, then link the authAccount.
 *
 * Decision (conservative): OIDC's resolveUser is deliberately left untouched
 * (own email_verified handling, no cross-provider check); this resolver
 * mirrors its link/anti-takeover rules and is stricter in one way - an
 * account linked to a DIFFERENT provider is never claimed by email, because
 * a directory `mail` attribute is often user-editable.
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
    },
    trx: KyselyTransaction,
  ): Promise<User> {
    const { email, name, providerUserId, provider, workspaceId } = params;

    const linked = await this.authAccountRepo.findByProviderUserId(
      provider.id,
      providerUserId,
      workspaceId,
      trx,
    );
    let user: User | undefined = linked
      ? await this.userRepo.findById(linked.userId, workspaceId, { trx })
      : undefined;

    if (!user) {
      user = await this.userRepo.findByEmail(email, workspaceId, { trx });
      if (user) {
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
    return user;
  }
}

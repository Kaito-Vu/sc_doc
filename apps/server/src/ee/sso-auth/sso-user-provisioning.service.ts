import { Injectable } from '@nestjs/common';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { KyselyTransaction } from '@docmost/db/types/kysely.types';
import { User } from '@docmost/db/types/entity.types';
import { WorkspaceService } from '../../core/workspace/services/workspace.service';
import { UserRole } from '../../common/helpers/types/permission';
import { nanoIdGen } from '../../common/helpers';

/**
 * Creates a user on first SSO login (OIDC/LDAP), mirroring this repo's own
 * signup provisioning (addUserToWorkspace + addUserToDefaultGroup) rather
 * than creating a bare row. The password is random and flagged as generated
 * so password-confirmation prompts (MFA disable etc.) are skipped for them.
 */
@Injectable()
export class SsoUserProvisioningService {
  constructor(
    private readonly userRepo: UserRepo,
    private readonly groupUserRepo: GroupUserRepo,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async provision(
    data: { email: string; name?: string; workspaceId: string },
    trx: KyselyTransaction,
  ): Promise<User> {
    const { email, name, workspaceId } = data;
    const user = await this.userRepo.insertUser(
      {
        email,
        name: name || email,
        password: nanoIdGen(16),
        workspaceId,
        role: UserRole.MEMBER,
        hasGeneratedPassword: true,
      },
      trx,
    );
    await this.workspaceService.addUserToWorkspace(
      user.id,
      workspaceId,
      undefined,
      trx,
    );
    await this.groupUserRepo.addUserToDefaultGroup(user.id, workspaceId, trx);
    return user;
  }
}

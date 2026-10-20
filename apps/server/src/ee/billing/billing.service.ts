import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BillingRepo } from './billing.repo';
import { User } from '@docmost/db/types/entity.types';
import { assertCanManageWorkspace } from '../common/workspace-admin';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';

@Injectable()
export class BillingService {
  constructor(
    private readonly billingRepo: BillingRepo,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  private mapBilling(row: any) {
    return {
      ...row,
      amount: row.amount != null ? Number(row.amount) : null,
      quantity: row.quantity != null ? Number(row.quantity) : null,
      tieredFlatAmount:
        row.tieredFlatAmount != null ? Number(row.tieredFlatAmount) : null,
      tieredUnitAmount:
        row.tieredUnitAmount != null ? Number(row.tieredUnitAmount) : null,
      periodStartAt: row.periodStartAt?.toISOString?.() ?? row.periodStartAt,
      periodEndAt: row.periodEndAt?.toISOString?.() ?? row.periodEndAt,
      cancelAt: row.cancelAt?.toISOString?.() ?? row.cancelAt,
      canceledAt: row.canceledAt?.toISOString?.() ?? row.canceledAt,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
      deletedAt: row.deletedAt?.toISOString?.() ?? row.deletedAt,
    };
  }

  async getInfo(user: User, workspaceId: string) {
    assertCanManageWorkspace(this.workspaceAbility, user, { id: workspaceId });
    const billing = await this.billingRepo.findByWorkspaceId(workspaceId);
    if (!billing) {
      throw new NotFoundException('No active subscription');
    }
    return this.mapBilling(billing);
  }

  async getPlans(user: User, workspaceId: string) {
    assertCanManageWorkspace(this.workspaceAbility, user, { id: workspaceId });
    // Self-hosted: no purchasable plans.
    return [];
  }

  async checkout(
    user: User,
    workspaceId: string,
    _data: { priceId: string },
  ) {
    assertCanManageWorkspace(this.workspaceAbility, user, { id: workspaceId });
    throw new BadRequestException(
      'Billing checkout is not available on self-hosted installations',
    );
  }

  async portal(user: User, workspaceId: string) {
    assertCanManageWorkspace(this.workspaceAbility, user, { id: workspaceId });
    throw new BadRequestException(
      'Billing portal is not available on self-hosted installations',
    );
  }
}

import { ForbiddenException } from '@nestjs/common';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';

type WorkspaceRef = Pick<Workspace, 'id'>;

export function isWorkspaceAdmin(
  abilityFactory: WorkspaceAbilityFactory,
  user: User,
  workspace: WorkspaceRef,
): boolean {
  return !abilityFactory
    .createForUser(user, workspace as Workspace)
    .cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings);
}

/** Single source of truth for "workspace admin/owner only" EE endpoints. */
export function assertWorkspaceAdmin(
  abilityFactory: WorkspaceAbilityFactory,
  user: User,
  workspace: WorkspaceRef,
): void {
  if (!isWorkspaceAdmin(abilityFactory, user, workspace)) {
    throw new ForbiddenException();
  }
}

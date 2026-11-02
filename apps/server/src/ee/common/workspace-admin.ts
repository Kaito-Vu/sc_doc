import { ForbiddenException } from '@nestjs/common';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';

// "Workspace admin" = may manage workspace settings (granted to OWNER and ADMIN).
export function canManageWorkspace(
  workspaceAbility: WorkspaceAbilityFactory,
  user: User,
  workspace: Pick<Workspace, 'id'>,
): boolean {
  return !workspaceAbility
    .createForUser(user, workspace as Workspace)
    .cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings);
}

export function assertCanManageWorkspace(
  workspaceAbility: WorkspaceAbilityFactory,
  user: User,
  workspace: Pick<Workspace, 'id'>,
): void {
  if (!canManageWorkspace(workspaceAbility, user, workspace)) {
    throw new ForbiddenException();
  }
}

/** @deprecated Prefer canManageWorkspace — kept for call sites that used the older name. */
export const isWorkspaceAdmin = canManageWorkspace;
/** @deprecated Prefer assertCanManageWorkspace — kept for call sites that used the older name. */
export const assertWorkspaceAdmin = assertCanManageWorkspace;

import { Test } from '@nestjs/testing';
import { SsoService } from './sso.service';
import { AuthProviderRepo } from './auth-provider.repo';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';

describe('SsoService', () => {
  let service: SsoService;
  let authProviderRepo: {
    insert: jest.Mock;
    update: jest.Mock;
    findById: jest.Mock;
    softDelete: jest.Mock;
  };
  let auditService: { log: jest.Mock };

  const user = { id: 'user-1' } as any;
  const workspace = { id: 'ws1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    authProviderRepo = {
      insert: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      softDelete: jest.fn(),
    };
    auditService = { log: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SsoService,
        { provide: AuthProviderRepo, useValue: authProviderRepo },
        {
          provide: WorkspaceAbilityFactory,
          useValue: {
            createForUser: () => ({ cannot: () => false }),
          },
        },
        { provide: AUDIT_SERVICE, useValue: auditService },
      ],
    }).compile();
    service = moduleRef.get(SsoService);
  });

  describe('create', () => {
    it('passes avatarSync through to the repo insert, defaulting to false', async () => {
      authProviderRepo.insert.mockResolvedValue({ id: 'p1', type: 'azure-ad', name: 'Azure AD' });

      await service.create(workspace.id, user, workspace, {
        name: 'Azure AD',
        type: 'azure-ad',
      });

      expect(authProviderRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ avatarSync: false }),
      );
    });

    it('honors an explicit avatarSync: true', async () => {
      authProviderRepo.insert.mockResolvedValue({ id: 'p1', type: 'azure-ad', name: 'Azure AD' });

      await service.create(workspace.id, user, workspace, {
        name: 'Azure AD',
        type: 'azure-ad',
        avatarSync: true,
      });

      expect(authProviderRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ avatarSync: true }),
      );
    });

    it('logs an SSO_PROVIDER_CREATED audit event', async () => {
      authProviderRepo.insert.mockResolvedValue({ id: 'p1', type: 'azure-ad', name: 'Azure AD' });

      await service.create(workspace.id, user, workspace, {
        name: 'Azure AD',
        type: 'azure-ad',
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.SSO_PROVIDER_CREATED,
          resourceType: AuditResource.SSO_PROVIDER,
          resourceId: 'p1',
        }),
      );
    });
  });

  describe('update', () => {
    it('passes avatarSync through to the repo update', async () => {
      authProviderRepo.findById.mockResolvedValue({ id: 'p1', type: 'azure-ad' });
      authProviderRepo.update.mockResolvedValue({ id: 'p1', type: 'azure-ad', name: 'Azure AD' });

      await service.update(workspace.id, user, workspace, {
        providerId: 'p1',
        avatarSync: true,
      });

      expect(authProviderRepo.update).toHaveBeenCalledWith(
        'p1',
        workspace.id,
        expect.objectContaining({ avatarSync: true }),
      );
    });

    it('logs an SSO_PROVIDER_UPDATED audit event', async () => {
      authProviderRepo.findById.mockResolvedValue({ id: 'p1', type: 'azure-ad' });
      authProviderRepo.update.mockResolvedValue({ id: 'p1', type: 'azure-ad', name: 'Azure AD' });

      await service.update(workspace.id, user, workspace, {
        providerId: 'p1',
        avatarSync: true,
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.SSO_PROVIDER_UPDATED,
          resourceType: AuditResource.SSO_PROVIDER,
          resourceId: 'p1',
        }),
      );
    });
  });

  describe('delete', () => {
    it('logs an SSO_PROVIDER_DELETED audit event', async () => {
      authProviderRepo.findById.mockResolvedValue({ id: 'p1', type: 'azure-ad', name: 'Azure AD' });

      await service.delete('p1', workspace.id, user, workspace);

      expect(authProviderRepo.softDelete).toHaveBeenCalledWith('p1', workspace.id);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.SSO_PROVIDER_DELETED,
          resourceType: AuditResource.SSO_PROVIDER,
          resourceId: 'p1',
        }),
      );
    });
  });
});

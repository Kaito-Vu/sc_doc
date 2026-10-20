import { Inject, Injectable } from '@nestjs/common';
import { Feature } from '../../common/features';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';

const ALL_FEATURES = Object.values(Feature);

@Injectable()
export class LicenseService {
  constructor(
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly environmentService: EnvironmentService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  isValidEELicense(_licenseKey: string): boolean {
    return true;
  }

  hasFeature(_licenseKey: string, _feature: string): boolean {
    return true;
  }

  getFeatures(_licenseKey: string): string[] {
    return ALL_FEATURES;
  }

  getLicenseType(_licenseKey: string): string {
    return 'enterprise';
  }

  async getLicenseInfo(workspaceId: string) {
    const workspace = await this.workspaceRepo.findById(workspaceId, {
      withLicenseKey: true,
    });

    return {
      id: workspaceId,
      customerName: workspace?.name ?? 'Self-hosted',
      seatCount: 999,
      licenseType: 'enterprise' as const,
      issuedAt: workspace?.createdAt ?? new Date(),
      expiresAt: new Date('2099-12-31'),
      trial: false,
    };
  }

  async activateLicense(workspaceId: string, licenseKey: string) {
    await this.workspaceRepo.updateWorkspace({ licenseKey }, workspaceId);
    const info = await this.getLicenseInfo(workspaceId);

    this.auditService.log({
      event: AuditEvent.LICENSE_ACTIVATED,
      resourceType: AuditResource.LICENSE,
      resourceId: workspaceId,
      metadata: {
        licenseType: info.licenseType,
        seatCount: info.seatCount,
        expiresAt: info.expiresAt,
      },
    });

    return info;
  }

  async removeLicense(workspaceId: string) {
    await this.workspaceRepo.updateWorkspace({ licenseKey: null }, workspaceId);

    this.auditService.log({
      event: AuditEvent.LICENSE_REMOVED,
      resourceType: AuditResource.LICENSE,
      resourceId: workspaceId,
    });
  }
}

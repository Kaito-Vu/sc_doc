import { Injectable } from '@nestjs/common';
import { Workspace } from '@docmost/db/types/entity.types';
import { WorkspaceSettingsRepo } from '../common/workspace-settings.repo';
import {
  AttachmentSettings,
  normalizeExtension,
  resolveAttachmentSettings,
} from './attachment-settings';
import { UpdateAttachmentSettingsDto } from './dto/update-attachment-settings.dto';

@Injectable()
export class AttachmentSettingsService {
  constructor(private readonly settingsRepo: WorkspaceSettingsRepo) {}

  get(workspace: Workspace): AttachmentSettings {
    return resolveAttachmentSettings(workspace.settings);
  }

  // Fields set to null are removed (back to default); undefined fields are kept.
  async update(
    workspace: Workspace,
    dto: UpdateAttachmentSettingsDto,
  ): Promise<AttachmentSettings> {
    const next: Record<string, unknown> = {
      ...((workspace.settings as any)?.attachments ?? {}),
    };
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined) continue;
      if (value === null) delete next[key];
      else if (key === 'allowedExtensions')
        next[key] = (value as string[]).map(normalizeExtension);
      else if (key === 'allowedMimeTypes')
        next[key] = (value as string[]).map((m) => m.trim().toLowerCase());
      else next[key] = value;
    }
    const settings = await this.settingsRepo.mergeSettings(workspace.id, {
      attachments: next,
    });
    return resolveAttachmentSettings(settings);
  }
}

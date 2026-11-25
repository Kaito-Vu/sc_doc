import { AttachmentSettingsService } from './attachment-settings.service';
import { DEFAULT_ALLOWED_EXTENSIONS } from './attachment-settings';

const make = (returned: any) => {
  const repo = { mergeSettings: jest.fn().mockResolvedValue(returned) };
  return { repo, service: new AttachmentSettingsService(repo as any) };
};

describe('AttachmentSettingsService', () => {
  it('get resolves defaults from workspace.settings', () => {
    const { service } = make(undefined);
    expect(service.get({ settings: {} } as any).allowedExtensions).toEqual([...DEFAULT_ALLOWED_EXTENSIONS]);
  });

  it('update merges dto over stored attachments and returns resolved settings', async () => {
    const stored = { attachments: { maxUploadBytes: 5, allowedMimeTypes: ['image/*'] } };
    const { repo, service } = make({ attachments: { maxUploadBytes: 9, allowedMimeTypes: ['image/*'] } });
    const out = await service.update({ id: 'w1', settings: stored } as any, { maxUploadBytes: 9 });
    expect(repo.mergeSettings).toHaveBeenCalledWith('w1', {
      attachments: { maxUploadBytes: 9, allowedMimeTypes: ['image/*'] },
    });
    expect(out.maxUploadBytes).toBe(9);
  });

  it('update stores empty lists and removes null fields', async () => {
    const stored = { attachments: { maxUploadBytes: 5, allowedExtensions: ['.pdf'] } };
    const { repo, service } = make({});
    await service.update({ id: 'w1', settings: stored } as any, {
      allowedExtensions: [],
      maxUploadBytes: null,
    });
    expect(repo.mergeSettings).toHaveBeenCalledWith('w1', {
      attachments: { allowedExtensions: [] },
    });
  });
});

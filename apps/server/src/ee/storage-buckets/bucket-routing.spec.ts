import {
  BucketRoutedS3Driver,
  setSpaceBucketResolver,
  objectKey,
  spaceIdOfKey,
} from './bucket-routing';

const WS = '019a0000-0000-7000-8000-000000000001';
const SPACE = '019a0000-0000-7000-8000-0000000000aa';
const PAGE = '019a0000-0000-7000-8000-0000000000bb';
const SPACE_KEY = `${WS}/${SPACE}/${PAGE}/att-image.png`;

describe('spaceIdOfKey', () => {
  it.each([
    [SPACE_KEY, SPACE],
    [`${WS}/avatars/a.png`, null],
    [`${WS}/files/${PAGE}/legacy.png`, null],
    [`exports/docx/token/a.docx`, null],
    [`${WS}/exports/${PAGE}/export.pdf`, null],
  ])('%s -> %s', (key, spaceId) => {
    expect(spaceIdOfKey(key)).toBe(spaceId);
  });
});

describe('objectKey', () => {
  it('drops {workspaceId}/{spaceId}/ from space keys only', () => {
    expect(objectKey(SPACE_KEY)).toBe(`${PAGE}/att-image.png`);
    expect(objectKey(`${WS}/avatars/a.png`)).toBe(`${WS}/avatars/a.png`);
  });
});

describe('BucketRoutedS3Driver', () => {
  const resolver = jest.fn(async (spaceId: string) =>
    spaceId === SPACE ? 'phong-ke-toan' : 'other',
  );
  setSpaceBucketResolver(resolver);

  const setup = (headStatus = 200) => {
    resolver.mockClear();
    const driver = new BucketRoutedS3Driver({
      region: 'us-east-1',
      endpoint: 'https://s3.example.com',
      bucket: 'system',
    } as any);
    const send = jest.fn(async (cmd: any) => {
      if (cmd.constructor.name === 'HeadBucketCommand' && headStatus !== 200) {
        throw Object.assign(new Error('nf'), { $metadata: { httpStatusCode: headStatus } });
      }
      return {};
    });
    driver.getDriver().send = send as any;
    const calls = () => send.mock.calls.map(([c]: any) => [c.constructor.name, c.input]);
    return { driver, calls };
  };

  it('creates the slug bucket once and resolves the space once', async () => {
    const { driver, calls } = setup(404);
    await driver.copy(SPACE_KEY, SPACE_KEY.replace('att-', 'new-'));
    await driver.copy(SPACE_KEY, SPACE_KEY.replace('att-', 'new2-'));

    expect(resolver).toHaveBeenCalledTimes(1);
    const creates = calls().filter(([n]) => n === 'CreateBucketCommand');
    expect(creates).toEqual([['CreateBucketCommand', { Bucket: 'phong-ke-toan' }]]);
    expect(calls().find(([n]) => n === 'CopyObjectCommand')?.[1].Bucket).toBe('phong-ke-toan');
  });

  it('copies across buckets with the source bucket in CopySource', async () => {
    const { driver, calls } = setup();
    const legacy = `${WS}/files/x/ảnh.png`;
    await driver.copy(legacy, SPACE_KEY);

    expect(calls()).toContainEqual(['HeadObjectCommand', { Bucket: 'system', Key: legacy }]);
    expect(calls().find(([n]) => n === 'CopyObjectCommand')?.[1]).toEqual({
      Bucket: 'phong-ke-toan',
      CopySource: `system/${WS}/files/x/${encodeURIComponent('ảnh.png')}`,
      Key: `${PAGE}/att-image.png`,
    });
  });

  it('ensureSpaceBucket creates a missing bucket for an existing space', async () => {
    const { driver, calls } = setup(404);
    await expect(driver.ensureSpaceBucket(SPACE.toUpperCase())).resolves.toBe('phong-ke-toan');
    expect(calls()).toContainEqual(['CreateBucketCommand', { Bucket: 'phong-ke-toan' }]);
  });

  it('deletes from the bucket the key routes to; system files skip the resolver', async () => {
    const { driver, calls } = setup();
    await driver.delete(`${WS}/avatars/a.png`);
    expect(resolver).not.toHaveBeenCalled();
    await driver.delete(SPACE_KEY);

    const deletes = calls().filter(([n]) => n === 'DeleteObjectCommand');
    expect(deletes.map(([, i]) => i.Bucket)).toEqual(['system', 'phong-ke-toan']);
  });

  it('exists() is false on HEAD 404 (any error name); copy of a missing source is skipped', async () => {
    const { driver, calls } = setup();
    driver.getDriver().send = jest.fn(async () => {
      throw Object.assign(new Error('UnknownError'), { $metadata: { httpStatusCode: 404 } });
    }) as any;
    await expect(driver.exists(SPACE_KEY)).resolves.toBe(false);
    await expect(driver.copy(SPACE_KEY, SPACE_KEY.replace('att-', 'new-'))).resolves.toBeUndefined();
    expect(calls()).toEqual([]);
  });

  it('enables versioning on space buckets (new or existing), not on system', async () => {
    const { driver, calls } = setup(200); // bucket already exists
    await driver.ensureSpaceBucket(SPACE);
    await driver.upload(`${WS}/avatars/a.png`, Buffer.from('x'));
    const versioning = calls().filter(([n]) => n === 'PutBucketVersioningCommand');
    expect(versioning).toEqual([
      [
        'PutBucketVersioningCommand',
        { Bucket: 'phong-ke-toan', VersioningConfiguration: { Status: 'Enabled' } },
      ],
    ]);
  });
});

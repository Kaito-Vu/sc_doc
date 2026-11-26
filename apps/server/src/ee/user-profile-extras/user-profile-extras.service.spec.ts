import {
  CamelCasePlugin,
  CompiledQuery,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { NotFoundException } from '@nestjs/common';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { UserProfileExtrasService } from './user-profile-extras.service';

const viewer = { userId: 'viewer', workspaceId: 'ws', canManageMembers: false };

function build(user: any) {
  const queries: CompiledQuery[] = [];
  const db = new Kysely<any>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (k) => new PostgresIntrospector(k),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
    log: (e) => {
      if (e.level === 'query') queries.push(e.query);
    },
  });
  const spaceMemberRepo = new SpaceMemberRepo(
    db as any,
    {} as any,
    new SpaceRepo(db as any, {} as any),
    {} as any,
  );
  const service = new UserProfileExtrasService(
    db as any,
    { findById: jest.fn().mockResolvedValue(user) } as any,
    spaceMemberRepo,
    new PagePermissionRepo(db as any, {} as any, {} as any),
  );
  return { service, queries };
}

describe('UserProfileExtrasService', () => {
  it('returns job fields and runs one heatmap query scoped to the viewer', async () => {
    const { service, queries } = build({
      jobTitle: 'Dev',
      department: 'IT',
      employeeId: 'E1',
    });

    await expect(service.getExtras('u2', viewer)).resolves.toMatchObject({
      jobTitle: 'Dev',
      department: 'IT',
      employeeId: 'E1',
      heatmap: [],
      heatmapFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      heatmapTo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    // handle lookup, then the heatmap
    expect(queries).toHaveLength(2);
    const heatmap = queries[1];
    expect(heatmap.parameters).toEqual(
      expect.arrayContaining(['u2', 'ws', 'viewer']),
    );
    expect(heatmap.sql).toMatch(/union all/i);
  });

  it('resolves a handle only when it matches exactly one user', async () => {
    const { service, queries } = build({});
    // dummy driver returns no rows
    await expect(service.resolveHandle('local-x', viewer)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(queries[0].parameters).toEqual(
      expect.arrayContaining(['ws', 'local-x']),
    );
    expect(queries[0].sql).toMatch(
      /coalesce\(ap\.type, 'local'\) \|\| '-' \|\| lower\(split_part/,
    );
  });

  it('hides disabled users from non-managers', async () => {
    const { service } = build({ deactivatedAt: new Date() });
    await expect(service.getExtras('u2', viewer)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.getExtras('u2', { ...viewer, canManageMembers: true }),
    ).resolves.toMatchObject({ heatmap: [] });
  });
});

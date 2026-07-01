import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

@Injectable()
export class WorkspaceFaviconRepository {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async updateWorkspaceFavicon(workspaceId: string, favicon: string | null) {
    return await (this.db as any)
      .updateTable('workspaces')
      .set({ favicon })
      .where('id', '=', workspaceId)
      .execute();
  }

  async getFavicon(workspaceId: string): Promise<string | null> {
    const result = await (this.db as any)
      .selectFrom('workspaces')
      .select('favicon')
      .where('id', '=', workspaceId)
      .executeTakeFirst();

    return result?.favicon ?? null;
  }
}

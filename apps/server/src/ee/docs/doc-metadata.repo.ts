import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';
import { DocMetadataRow } from './doc-metadata.types';

type ListParams = {
  workspaceId: string;
  spaceIds?: string[];
  filter?: string;
  classification?: string;
  docType?: string;
  query?: string;
  limit: number;
  offset: number;
};

type HealthParams = {
  workspaceId: string;
  spaceIds?: string[];
};

@Injectable()
export class DocMetadataRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findByPageId(pageId: string) {
    return (this.db as any)
      .selectFrom('ee_doc_metadata')
      .selectAll()
      .where('page_id', '=', pageId)
      .executeTakeFirst();
  }

  async ensure(
    pageId: string,
    workspaceId: string,
    spaceId: string,
    ownerId: string | null,
    userId: string,
  ) {
    await (this.db as any)
      .insertInto('ee_doc_metadata')
      .values({
        page_id: pageId,
        workspace_id: workspaceId,
        space_id: spaceId,
        owner_id: ownerId,
        created_by_id: userId,
        updated_by_id: userId,
      })
      .onConflict((oc: any) => oc.column('page_id').doNothing())
      .execute();
  }

  async update(pageId: string, patch: Record<string, unknown>) {
    return (this.db as any)
      .updateTable('ee_doc_metadata')
      .set({ ...patch, updated_at: new Date() })
      .where('page_id', '=', pageId)
      .returningAll()
      .executeTakeFirst();
  }

  async findDetail(pageId: string): Promise<DocMetadataRow | undefined> {
    const result = await sql<DocMetadataRow>`
      SELECT
        m.id,
        m.page_id,
        m.workspace_id,
        m.space_id,
        m.owner_id,
        m.reviewer_id,
        m.classification,
        m.doc_type,
        m.effective_at,
        m.review_due_at,
        m.archived_at,
        m.notes,
        m.created_at,
        m.updated_at,
        u.id AS owner_user_id,
        u.name AS owner_name,
        u.avatar_url AS owner_avatar_url,
        r.id AS reviewer_user_id,
        r.name AS reviewer_name,
        r.avatar_url AS reviewer_avatar_url,
        p.title AS page_title,
        p.slug_id AS page_slug_id,
        p.icon AS page_icon,
        s.name AS space_name,
        s.slug AS space_slug,
        v.status AS verification_status,
        v.expires_at AS verification_expires_at
      FROM ee_doc_metadata m
      INNER JOIN pages p ON p.id = m.page_id
      INNER JOIN spaces s ON s.id = m.space_id
      LEFT JOIN users u ON u.id = m.owner_id
      LEFT JOIN users r ON r.id = m.reviewer_id
      LEFT JOIN LATERAL (
        SELECT pv.status, pv.expires_at
        FROM page_verifications pv
        WHERE pv.page_id = m.page_id
        ORDER BY pv.created_at DESC
        LIMIT 1
      ) v ON true
      WHERE m.page_id = ${pageId}
      LIMIT 1
    `.execute(this.db);

    return result.rows[0];
  }

  async list(params: ListParams): Promise<DocMetadataRow[]> {
    const {
      workspaceId,
      spaceIds,
      filter,
      classification,
      docType,
      query,
      limit,
      offset,
    } = params;

    const spaceFilter = spaceIds?.length
      ? sql`AND m.space_id IN (${sql.join(
          spaceIds.map((id) => sql`${id}`),
          sql`, `,
        )})`
      : sql``;

    const classificationFilter = classification
      ? sql`AND m.classification = ${classification}`
      : sql``;

    const docTypeFilter = docType
      ? sql`AND m.doc_type = ${docType}`
      : sql``;

    const queryFilter = query
      ? sql`AND f_unaccent(p.title) ILIKE f_unaccent(${`%${query}%`})`
      : sql``;

    let filterFragment = sql``;
    switch (filter) {
      case 'active':
        filterFragment = sql`AND m.archived_at IS NULL`;
        break;
      case 'missing-owner':
        filterFragment = sql`AND m.owner_id IS NULL`;
        break;
      case 'missing-classification':
        filterFragment = sql`AND (m.classification IS NULL OR m.classification = '')`;
        break;
      case 'review-overdue':
        filterFragment = sql`AND m.review_due_at IS NOT NULL AND m.review_due_at < now()`;
        break;
      case 'archived':
        filterFragment = sql`AND m.archived_at IS NOT NULL`;
        break;
      case 'in-review':
        filterFragment = sql`AND v.status = 'in_approval'`;
        break;
      case 'approved':
        filterFragment = sql`AND v.status IN ('approved', 'verified')`;
        break;
      case 'orphan':
        filterFragment = sql`AND NOT EXISTS (
          SELECT 1 FROM backlinks b WHERE b.target_page_id = m.page_id
        )`;
        break;
      case 'duplicate-titles':
        filterFragment = sql`AND EXISTS (
          SELECT 1
          FROM ee_doc_metadata m2
          INNER JOIN pages p2 ON p2.id = m2.page_id
          WHERE m2.space_id = m.space_id
            AND m2.page_id <> m.page_id
            AND p2.deleted_at IS NULL
            AND p.title IS NOT NULL
            AND p.title <> ''
            AND p2.title IS NOT NULL
            AND p2.title <> ''
            AND lower(p2.title) = lower(p.title)
        )`;
        break;
      default:
        filterFragment = sql``;
    }

    const result = await sql<DocMetadataRow>`
      SELECT
        m.id,
        m.page_id,
        m.workspace_id,
        m.space_id,
        m.owner_id,
        m.reviewer_id,
        m.classification,
        m.doc_type,
        m.effective_at,
        m.review_due_at,
        m.archived_at,
        m.notes,
        m.created_at,
        m.updated_at,
        u.id AS owner_user_id,
        u.name AS owner_name,
        u.avatar_url AS owner_avatar_url,
        r.id AS reviewer_user_id,
        r.name AS reviewer_name,
        r.avatar_url AS reviewer_avatar_url,
        p.title AS page_title,
        p.slug_id AS page_slug_id,
        p.icon AS page_icon,
        s.name AS space_name,
        s.slug AS space_slug,
        v.status AS verification_status,
        v.expires_at AS verification_expires_at
      FROM ee_doc_metadata m
      INNER JOIN pages p ON p.id = m.page_id
      INNER JOIN spaces s ON s.id = m.space_id
      LEFT JOIN users u ON u.id = m.owner_id
      LEFT JOIN users r ON r.id = m.reviewer_id
      LEFT JOIN LATERAL (
        SELECT pv.status, pv.expires_at
        FROM page_verifications pv
        WHERE pv.page_id = m.page_id
        ORDER BY pv.created_at DESC
        LIMIT 1
      ) v ON true
      WHERE m.workspace_id = ${workspaceId}
        AND p.deleted_at IS NULL
        ${spaceFilter}
        ${classificationFilter}
        ${docTypeFilter}
        ${queryFilter}
        ${filterFragment}
      ORDER BY m.updated_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `.execute(this.db);

    return result.rows;
  }

  async health(params: HealthParams) {
    const { workspaceId, spaceIds } = params;
    const spaceFilter = spaceIds?.length
      ? sql`AND m.space_id IN (${sql.join(
          spaceIds.map((id) => sql`${id}`),
          sql`, `,
        )})`
      : sql``;

    const result = await sql<{
      total: string;
      missing_owner: string;
      missing_classification: string;
      review_overdue: string;
      archived: string;
      in_review: string;
      orphan: string;
    }>`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE m.owner_id IS NULL) AS missing_owner,
        COUNT(*) FILTER (
          WHERE m.classification IS NULL OR m.classification = ''
        ) AS missing_classification,
        COUNT(*) FILTER (
          WHERE m.review_due_at IS NOT NULL AND m.review_due_at < now()
        ) AS review_overdue,
        COUNT(*) FILTER (WHERE m.archived_at IS NOT NULL) AS archived,
        COUNT(*) FILTER (WHERE v.status = 'in_approval') AS in_review,
        COUNT(*) FILTER (
          WHERE NOT EXISTS (
            SELECT 1 FROM backlinks b WHERE b.target_page_id = m.page_id
          )
        ) AS orphan
      FROM ee_doc_metadata m
      INNER JOIN pages p ON p.id = m.page_id
      LEFT JOIN LATERAL (
        SELECT pv.status
        FROM page_verifications pv
        WHERE pv.page_id = m.page_id
        ORDER BY pv.created_at DESC
        LIMIT 1
      ) v ON true
      WHERE m.workspace_id = ${workspaceId}
        AND p.deleted_at IS NULL
        ${spaceFilter}
    `.execute(this.db);

    const duplicateResult = await sql<{ duplicate_titles: string }>`
      SELECT COALESCE(SUM(cnt - 1), 0) AS duplicate_titles
      FROM (
        SELECT COUNT(*) AS cnt
        FROM ee_doc_metadata m
        INNER JOIN pages p ON p.id = m.page_id
        WHERE m.workspace_id = ${workspaceId}
          AND p.deleted_at IS NULL
          AND p.title IS NOT NULL
          AND p.title <> ''
          ${spaceFilter}
        GROUP BY m.space_id, lower(p.title)
        HAVING COUNT(*) > 1
      ) duplicates
    `.execute(this.db);

    const row = result.rows[0];
    return {
      total: Number(row?.total ?? 0),
      missingOwner: Number(row?.missing_owner ?? 0),
      missingClassification: Number(row?.missing_classification ?? 0),
      reviewOverdue: Number(row?.review_overdue ?? 0),
      archived: Number(row?.archived ?? 0),
      inReview: Number(row?.in_review ?? 0),
      orphan: Number(row?.orphan ?? 0),
      duplicateTitles: Number(
        duplicateResult.rows[0]?.duplicate_titles ?? 0,
      ),
    };
  }
}

import { Injectable } from '@nestjs/common'
import { InjectKysely } from 'nestjs-kysely'
import { Kysely, sql } from 'kysely'

export interface RecaptchaVerification {
  id: string
  workspaceId: string
  token: string
  score: number
  action: string
  decision: 'allow' | 'challenge' | 'block'
  decisionReason?: string
  userId?: string
  ipAddress?: string
  userAgent?: string
  challengeTs?: Date
  createdAt: Date
}

@Injectable()
export class RecaptchaVerificationRepo {
  constructor(@InjectKysely() private readonly db: Kysely<any>) {}

  async create(verification: Omit<RecaptchaVerification, 'id' | 'createdAt'>): Promise<RecaptchaVerification> {
    const result = await this.db
      .insertInto('recaptcha_verifications')
      .values({
        workspace_id: verification.workspaceId,
        token: verification.token,
        score: verification.score,
        action: verification.action,
        decision: verification.decision,
        decision_reason: verification.decisionReason,
        user_id: verification.userId,
        ip_address: verification.ipAddress,
        user_agent: verification.userAgent,
        challenge_ts: verification.challengeTs
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return {
      id: result.id,
      workspaceId: result.workspaceId,
      token: result.token,
      score: result.score,
      action: result.action,
      decision: result.decision,
      decisionReason: result.decisionReason,
      userId: result.userId,
      ipAddress: result.ipAddress,
      userAgent: result.userAgent,
      challengeTs: result.challengeTs,
      createdAt: result.createdAt
    }
  }

  async findByWorkspace(workspaceId: string, action?: string): Promise<RecaptchaVerification[]> {
    let query = this.db
      .selectFrom('recaptcha_verifications')
      .selectAll()
      .where('workspace_id', '=', workspaceId)

    if (action) {
      query = query.where('action', '=', action)
    }

    const results = await query.orderBy('created_at', 'desc').execute()

    return results.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      token: row.token,
      score: row.score,
      action: row.action,
      decision: row.decision,
      decisionReason: row.decisionReason,
      userId: row.userId,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      challengeTs: row.challengeTs,
      createdAt: row.createdAt
    }))
  }

  async getStatistics(workspaceId: string, hoursBack: number = 24): Promise<{
    totalCount: number
    allowCount: number
    challengeCount: number
    blockCount: number
    averageScore: number
  }> {
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000)

    const result = await this.db
      .selectFrom('recaptcha_verifications')
      .select([
        sql<number>`COUNT(*)`.as('total'),
        sql<number>`COUNT(CASE WHEN decision = 'allow' THEN 1 END)`.as('allowCount'),
        sql<number>`COUNT(CASE WHEN decision = 'challenge' THEN 1 END)`.as('challengeCount'),
        sql<number>`COUNT(CASE WHEN decision = 'block' THEN 1 END)`.as('blockCount'),
        sql<number>`AVG(score)`.as('avgScore')
      ])
      .where('workspace_id', '=', workspaceId)
      .where('created_at', '>=', cutoffTime)
      .executeTakeFirst()

    return {
      totalCount: Number(result?.total || 0),
      allowCount: Number(result?.allowCount || 0),
      challengeCount: Number(result?.challengeCount || 0),
      blockCount: Number(result?.blockCount || 0),
      averageScore: Number(result?.avgScore || 0)
    }
  }

  async countToday(workspaceId: string): Promise<number> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const result = await this.db
      .selectFrom('recaptcha_verifications')
      .select(sql<number>`COUNT(*)`.as('count'))
      .where('workspace_id', '=', workspaceId)
      .where('created_at', '>=', today)
      .executeTakeFirst()

    return Number(result?.count || 0)
  }

  async getAverageScore(workspaceId: string, hours: number = 24): Promise<number> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000)

    const result = await this.db
      .selectFrom('recaptcha_verifications')
      .select(sql<number>`AVG(score)`.as('avg'))
      .where('workspace_id', '=', workspaceId)
      .where('created_at', '>=', cutoffTime)
      .executeTakeFirst()

    return Number(result?.avg || 0)
  }
}

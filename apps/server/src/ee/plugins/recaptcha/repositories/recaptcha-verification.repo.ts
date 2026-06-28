import { Injectable, Logger } from '@nestjs/common'
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
  private readonly logger = new Logger(RecaptchaVerificationRepo.name)

  constructor(@InjectKysely() private db: Kysely<any>) {}

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
      workspaceId: result.workspace_id,
      token: result.token,
      score: result.score,
      action: result.action,
      decision: result.decision,
      decisionReason: result.decision_reason,
      userId: result.user_id,
      ipAddress: result.ip_address,
      userAgent: result.user_agent,
      challengeTs: result.challenge_ts,
      createdAt: result.created_at
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
      workspaceId: row.workspace_id,
      token: row.token,
      score: row.score,
      action: row.action,
      decision: row.decision,
      decisionReason: row.decision_reason,
      userId: row.user_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      challengeTs: row.challenge_ts,
      createdAt: row.created_at
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
        sql<number>`COUNT(CASE WHEN decision = 'allow' THEN 1 END)`.as('allow_count'),
        sql<number>`COUNT(CASE WHEN decision = 'challenge' THEN 1 END)`.as('challenge_count'),
        sql<number>`COUNT(CASE WHEN decision = 'block' THEN 1 END)`.as('block_count'),
        sql<number>`AVG(score)`.as('avg_score')
      ])
      .where('workspace_id', '=', workspaceId)
      .where('created_at', '>=', cutoffTime)
      .executeTakeFirst()

    return {
      totalCount: Number(result?.total || 0),
      allowCount: Number(result?.allow_count || 0),
      challengeCount: Number(result?.challenge_count || 0),
      blockCount: Number(result?.block_count || 0),
      averageScore: Number(result?.avg_score || 0)
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

import { Injectable, Logger } from '@nestjs/common'
import { RecaptchaVerificationRepo } from '../repositories/recaptcha-verification.repo'

export interface RecaptchaAnalytics {
  totalVerifications: number
  blockedCount: number
  challengedCount: number
  allowedCount: number
  averageScore: number
  blockRate: number
  scoreDistribution: {
    '0.0-0.2': number
    '0.2-0.4': number
    '0.4-0.6': number
    '0.6-0.8': number
    '0.8-1.0': number
  }
}

@Injectable()
export class RecaptchaAnalyticsService {
  private readonly logger = new Logger(RecaptchaAnalyticsService.name)

  constructor(private verificationRepo: RecaptchaVerificationRepo) {}

  async getAnalytics(workspaceId: string, hoursBack: number = 24): Promise<RecaptchaAnalytics> {
    const stats = await this.verificationRepo.getStatistics(workspaceId, hoursBack)

    // Calculate block rate
    const blockRate =
      stats.totalCount > 0 ? (stats.blockCount / stats.totalCount) * 100 : 0

    // Get score distribution
    const verifications = await this.verificationRepo.findByWorkspace(workspaceId)
    const scoreDistribution = {
      '0.0-0.2': 0,
      '0.2-0.4': 0,
      '0.4-0.6': 0,
      '0.6-0.8': 0,
      '0.8-1.0': 0
    }

    for (const verification of verifications) {
      if (verification.score < 0.2) scoreDistribution['0.0-0.2']++
      else if (verification.score < 0.4) scoreDistribution['0.2-0.4']++
      else if (verification.score < 0.6) scoreDistribution['0.4-0.6']++
      else if (verification.score < 0.8) scoreDistribution['0.6-0.8']++
      else scoreDistribution['0.8-1.0']++
    }

    return {
      totalVerifications: stats.totalCount,
      blockedCount: stats.blockCount,
      challengedCount: stats.challengeCount,
      allowedCount: stats.allowCount,
      averageScore: stats.averageScore,
      blockRate: Math.round(blockRate * 100) / 100,
      scoreDistribution
    }
  }
}

import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common'

export interface VerifyTokenResponse {
  success: boolean
  score: number
  action: string
  challengeTs: Date
  hostname: string
  errorCodes: string[]
}

export interface EvaluationResult {
  decision: 'allow' | 'challenge' | 'block'
  confidence: number
  reason: string
}

@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name)
  private readonly VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'
  private readonly TIMEOUT = 5000

  async verifyToken(token: string, secretKey: string): Promise<VerifyTokenResponse> {
    if (!token) {
      throw new BadRequestException('reCAPTCHA token is required')
    }

    if (!secretKey) {
      throw new BadRequestException('reCAPTCHA secret key is not configured')
    }

    try {
      const params = new URLSearchParams()
      params.append('secret', secretKey)
      params.append('response', token)

      const response = await fetch(this.VERIFY_URL, {
        method: 'POST',
        body: params,
        signal: AbortSignal.timeout(this.TIMEOUT)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = (await response.json()) as Record<string, any>

      if (!data.success) {
        this.logger.warn(`Token verification failed: ${data['error-codes']?.join(', ')}`)
        return {
          success: false,
          score: 0,
          action: data.action || 'unknown',
          challengeTs: new Date(data.challenge_ts || Date.now()),
          hostname: data.hostname || '',
          errorCodes: data['error-codes'] || []
        }
      }

      // Validate response structure
      if (typeof data.score !== 'number' || data.score < 0 || data.score > 1) {
        throw new InternalServerErrorException('Invalid score returned from reCAPTCHA')
      }

      return {
        success: true,
        score: data.score,
        action: data.action,
        challengeTs: new Date(data.challenge_ts),
        hostname: data.hostname,
        errorCodes: []
      }
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error
      }

      this.logger.error(
        'Failed to verify reCAPTCHA token',
        error instanceof Error ? error.stack : String(error),
      )

      throw new InternalServerErrorException(
        'reCAPTCHA verification temporarily unavailable',
      )
    }
  }

  async evaluateScore(
    score: number,
    action: string,
    threshold: number
  ): Promise<EvaluationResult> {
    // Validate inputs
    if (typeof score !== 'number' || score < 0 || score > 1) {
      throw new BadRequestException(`Invalid score: ${score}. Must be between 0 and 1`)
    }

    if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
      throw new BadRequestException(`Invalid threshold: ${threshold}. Must be between 0 and 1`)
    }

    // Evaluate score against threshold with challenge boundary
    // Challenge zone: threshold - 0.2 to threshold
    const challengeBoundary = Math.max(0, threshold - 0.2)

    if (score >= threshold) {
      return {
        decision: 'allow',
        confidence: score,
        reason: `Score ${score.toFixed(2)} >= threshold ${threshold.toFixed(2)}`
      }
    } else if (score >= challengeBoundary) {
      return {
        decision: 'challenge',
        confidence: 1 - score,
        reason: `Score ${score.toFixed(2)} in challenge zone [${challengeBoundary.toFixed(2)}, ${threshold.toFixed(2)})`
      }
    } else {
      return {
        decision: 'block',
        confidence: 1 - score,
        reason: `Score ${score.toFixed(2)} < challenge boundary ${challengeBoundary.toFixed(2)}`
      }
    }
  }
}

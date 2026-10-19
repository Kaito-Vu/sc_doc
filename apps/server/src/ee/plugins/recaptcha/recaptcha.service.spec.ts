import { BadRequestException } from '@nestjs/common'
import { RecaptchaService } from './recaptcha.service'
import { PluginConfigService } from '../services/plugin-config.service'

describe('RecaptchaService.verifyAction', () => {
  const create = jest.fn()
  const getConfig = jest.fn()
  const service = new RecaptchaService(
    { getConfig } as any,
    { create } as any,
  )
  const input = { workspaceId: 'ws', action: 'login', token: 't' }

  beforeEach(() => {
    jest.resetAllMocks()
    getConfig.mockResolvedValue({
      enabled: true,
      config: { secretKey: 's', actions: { login: { enabled: true } } },
    })
  })

  const google = (action: string, score: number) =>
    jest.spyOn(service, 'verifyToken').mockResolvedValue({
      success: true,
      score,
      action,
      challengeTs: new Date(),
      hostname: 'h',
      errorCodes: [],
    })

  it('returns null when the action is disabled', async () => {
    getConfig.mockResolvedValue({ enabled: true, config: { actions: {} } })
    await expect(service.verifyAction(input, { defaultThreshold: 0.5 })).resolves.toBeNull()
  })

  it('rejects a token minted for another action', async () => {
    google('shareGetInfo', 0.9)
    await expect(
      service.verifyAction(input, { defaultThreshold: 0.5 }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(create).not.toHaveBeenCalled()
  })

  it('falls back to the default threshold when none is configured', async () => {
    google('login', 0.6)
    const res = await service.verifyAction(input, { defaultThreshold: 0.5 })
    expect(res?.decision).toBe('allow')
    expect(create).toHaveBeenCalled()
  })

  it('lets a missing token through only when optional', async () => {
    await expect(
      service.verifyAction({ ...input, token: undefined }, { defaultThreshold: 0.5, tokenOptional: true }),
    ).resolves.toBeNull()
    await expect(
      service.verifyAction({ ...input, token: undefined }, { defaultThreshold: 0.5 }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('PluginConfigService config validation', () => {
  const svc = new PluginConfigService({} as any, {} as any) as any
  const schema = {
    properties: {
      secretKey: { type: 'string', required: true },
      actions: {
        type: 'object',
        properties: {
          login: {
            type: 'object',
            properties: { threshold: { type: 'number', minimum: 0, maximum: 1 } },
          },
        },
      },
    },
  }

  it('validates nested objects and numeric bounds', () => {
    expect(svc.validateObject({ secretKey: 'x', actions: { login: { threshold: 2 } } }, schema, '')).toEqual([
      'Field actions.login.threshold must be <= 1',
    ])
    expect(svc.validateObject({ actions: { login: { threshold: '0.5' } } }, schema, '')).toEqual([
      'Missing required field: secretKey',
      'Field actions.login.threshold must be number',
    ])
    expect(svc.validateObject({ secretKey: 'x', actions: { login: { threshold: 0.5 } } }, schema, '')).toEqual([])
  })
})

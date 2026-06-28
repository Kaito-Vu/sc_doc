import api from "@/lib/api-client"

export interface RecaptchaConfigResponse {
  enabled: boolean
  siteKey?: string
  actions: {
    login?: {
      enabled: boolean
      threshold: number
    }
    signup?: {
      enabled: boolean
      threshold: number
    }
  }
}

let cachedConfig: RecaptchaConfigResponse | null = null
let configFetchPromise: Promise<RecaptchaConfigResponse> | null = null

const defaultConfig = (): RecaptchaConfigResponse => ({
  enabled: false,
  actions: {
    login: { enabled: false, threshold: 0.5 },
    signup: { enabled: false, threshold: 0.7 },
  },
})

export async function getRecaptchaConfig(): Promise<RecaptchaConfigResponse> {
  if (cachedConfig) {
    return cachedConfig
  }

  if (configFetchPromise) {
    return configFetchPromise
  }

  configFetchPromise = (async () => {
    try {
      const res = await api.get<{
        enabled: boolean
        config?: {
          siteKey?: string
          actions?: RecaptchaConfigResponse['actions']
        }
      }>('/plugins/recaptcha/config')

      const payload = res.data as {
        enabled: boolean
        config?: {
          siteKey?: string
          actions?: RecaptchaConfigResponse['actions']
        }
      }

      const config: RecaptchaConfigResponse = {
        enabled: Boolean(payload?.enabled),
        siteKey: payload?.config?.siteKey,
        actions: payload?.config?.actions || defaultConfig().actions,
      }

      cachedConfig = config
      return config
    } catch (err) {
      console.warn('Failed to fetch reCAPTCHA config:', err)
      const fallback = defaultConfig()
      cachedConfig = fallback
      return fallback
    } finally {
      configFetchPromise = null
    }
  })()

  return configFetchPromise
}

export function clearRecaptchaConfigCache() {
  cachedConfig = null
}

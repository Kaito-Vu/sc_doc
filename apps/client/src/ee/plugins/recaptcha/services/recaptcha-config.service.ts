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

export async function getRecaptchaConfig(): Promise<RecaptchaConfigResponse> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig
  }

  // Prevent multiple concurrent requests
  if (configFetchPromise) {
    return configFetchPromise
  }

  configFetchPromise = (async () => {
    try {
      // Try to get config from plugin API
      const response: any = await api.get('/plugins/recaptcha/config')
      const config = response.data?.data || {
        enabled: false,
        actions: {
          login: { enabled: false, threshold: 0.5 },
          signup: { enabled: false, threshold: 0.7 }
        }
      }
      cachedConfig = config
      return config
    } catch (err) {
      // If plugin not configured, return disabled config
      console.warn('Failed to fetch reCAPTCHA config:', err)
      const defaultConfig: RecaptchaConfigResponse = {
        enabled: false,
        actions: {
          login: { enabled: false, threshold: 0.5 },
          signup: { enabled: false, threshold: 0.7 }
        }
      }
      cachedConfig = defaultConfig
      return defaultConfig
    } finally {
      configFetchPromise = null
    }
  })()

  return configFetchPromise
}

export function clearRecaptchaConfigCache() {
  cachedConfig = null
}

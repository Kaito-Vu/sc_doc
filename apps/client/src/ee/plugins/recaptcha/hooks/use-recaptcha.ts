import { useEffect, useState } from 'react'

interface UseRecaptchaOptions {
  siteKey: string
  enabled?: boolean
}

interface UseRecaptchaResult {
  ready: boolean
  loading: boolean
  error: string | null
  getToken: (action: string) => Promise<string>
  reset: () => void
}

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void
      execute: (siteKey: string, options: { action: string }) => Promise<string>
    }
  }
}

export function useRecaptcha({ siteKey, enabled = true }: UseRecaptchaOptions): UseRecaptchaResult {
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!siteKey || !enabled) {
      setLoading(false)
      return
    }

    // Script already loaded
    if (window.grecaptcha) {
      window.grecaptcha.ready(() => {
        setReady(true)
        setLoading(false)
      })
      return
    }

    // Load reCAPTCHA script
    const script = document.createElement('script')
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`
    script.async = true

    script.onload = () => {
      if (window.grecaptcha) {
        window.grecaptcha.ready(() => {
          setReady(true)
          setLoading(false)
          setError(null)
        })
      } else {
        setError('reCAPTCHA script loaded but grecaptcha not found')
        setLoading(false)
      }
    }

    script.onerror = () => {
      setError('Failed to load reCAPTCHA script')
      setLoading(false)
    }

    document.head.appendChild(script)

    return () => {
      // Cleanup: Remove script if component unmounts
      // Note: Not removing as reCAPTCHA might be used elsewhere
    }
  }, [siteKey, enabled])

  const getToken = async (action: string = 'submit'): Promise<string> => {
    if (!ready || !window.grecaptcha) {
      throw new Error('reCAPTCHA not ready')
    }

    try {
      const token = await window.grecaptcha.execute(siteKey, { action })
      if (!token) {
        throw new Error('Failed to generate reCAPTCHA token')
      }
      return token
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate reCAPTCHA token'
      setError(message)
      throw err
    }
  }

  const reset = () => {
    setError(null)
  }

  return {
    ready,
    loading,
    error,
    getToken,
    reset
  }
}

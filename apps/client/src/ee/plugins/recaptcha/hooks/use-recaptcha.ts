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

    // Ignore callbacks that land after unmount / siteKey change.
    let active = true
    const markReady = () => {
      window.grecaptcha!.ready(() => {
        if (!active) return
        setReady(true)
        setLoading(false)
        setError(null)
      })
    }

    // Script already loaded
    if (window.grecaptcha) {
      markReady()
      return () => {
        active = false
      }
    }

    // Load reCAPTCHA script once; a second mount before it finished loading
    // reuses the pending <script> instead of appending another one.
    const src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    const script = existing ?? document.createElement('script')
    if (!existing) {
      script.src = src
      script.async = true
      document.head.appendChild(script)
    }

    const onLoad = () => {
      if (!active) return
      if (window.grecaptcha) {
        markReady()
      } else {
        setError('reCAPTCHA script loaded but grecaptcha not found')
        setLoading(false)
      }
    }
    const onError = () => {
      if (!active) return
      setError('Failed to load reCAPTCHA script')
      setLoading(false)
    }
    script.addEventListener('load', onLoad)
    script.addEventListener('error', onError)

    return () => {
      // The script itself stays: reCAPTCHA may be used elsewhere.
      active = false
      script.removeEventListener('load', onLoad)
      script.removeEventListener('error', onError)
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

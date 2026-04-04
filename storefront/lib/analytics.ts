import { hasAnalyticsConsent } from '@/lib/cookie-consent'

const DEFAULT_HEARTBEAT_INTERVAL = 3000 // 3 seconds
const SLOW_HEARTBEAT_INTERVAL = 5000 // 5 seconds on slow connections
const FLUSH_INTERVAL = 3000 // 3 seconds
const MAX_BATCH_SIZE = 20
const SESSION_TIMEOUT = 30 * 60 * 1000 // 30 minutes

const SESSION_ID_KEY = 'amboras_session_id'
const LAST_ACTIVITY_KEY = 'amboras_last_activity'

interface AnalyticsEvent {
  type: 'session_start' | 'page_view' | 'heartbeat' | 'session_end'
    | 'add_to_cart' | 'begin_checkout' | 'purchase'
  url?: string
  referrer?: string
  title?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  product_id?: string
  variant_id?: string
  quantity?: number
  value?: number
  currency?: string
  order_id?: string
  item_count?: number
  cart_id?: string
  timestamp: number
}

interface AnalyticsPayload {
  store_id: string
  session_id: string
  events: AnalyticsEvent[]
}

function scheduleIdle(fn: () => void): void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(fn, { timeout: 2000 })
  } else {
    setTimeout(fn, 0)
  }
}

function getHeartbeatInterval(): number {
  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const conn = navigator.connection
    if (conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g') {
      return SLOW_HEARTBEAT_INTERVAL
    }
  }
  return DEFAULT_HEARTBEAT_INTERVAL
}

class AnalyticsTracker {
  private sessionId: string | null = null
  private storeId: string
  private publishableKey: string
  private endpoint: string
  private eventQueue: AnalyticsEvent[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private isInitialized = false

  private handleVisibilityChange: () => void
  private handlePageHide: () => void

  constructor() {
    this.storeId = process.env.NEXT_PUBLIC_STORE_ID || ''
    this.publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ''
    const medusaUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || ''
    this.endpoint = medusaUrl
      ? `${medusaUrl}/store/analytics`
      : process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT || ''

    this.handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this.pushEvent({ type: 'session_end', url: window.location.pathname, timestamp: Date.now() })
        this.flushBeacon()
        this.stopHeartbeat()
      } else {
        if (this.isSessionExpired()) {
          this.startNewSession()
        } else {
          this.startHeartbeat()
        }
      }
    }

    this.handlePageHide = () => {
      this.pushEvent({ type: 'session_end', url: window.location.pathname, timestamp: Date.now() })
      this.flushBeacon()
    }
  }

  init(): void {
    if (this.isInitialized) return
    if (!this.storeId || !this.endpoint) return
    if (!hasAnalyticsConsent()) return

    this.isInitialized = true
    this.startNewSession()

    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    window.addEventListener('pagehide', this.handlePageHide)
  }

  private startNewSession(): void {
    this.sessionId = this.getOrCreateSession()

    const utm = this.getUTMParams()
    this.pushEvent({
      type: 'session_start',
      url: window.location.pathname,
      referrer: document.referrer || undefined,
      title: document.title || undefined,
      ...utm,
      timestamp: Date.now(),
    })

    // Fire immediate heartbeat so user shows as "live" right away, then flush it
    this.pushEvent({ type: 'heartbeat', url: window.location.pathname, timestamp: Date.now() })
    this.flush()
    this.startHeartbeat()
    this.startFlushTimer()
  }

  trackPageView(url: string, title?: string): void {
    if (!this.isInitialized) return

    scheduleIdle(() => {
      this.pushEvent({
        type: 'page_view',
        url,
        title,
        timestamp: Date.now(),
      })
      this.updateLastActivity()
    })
  }

  trackAddToCart(productId: string, variantId: string, quantity: number, value?: number): void {
    if (!this.isInitialized) return
    this.pushEvent({
      type: 'add_to_cart',
      url: window.location.pathname,
      product_id: productId,
      variant_id: variantId,
      quantity,
      value,
      timestamp: Date.now(),
    })
    this.updateLastActivity()
  }

  trackBeginCheckout(cartId: string, value?: number, currency?: string): void {
    if (!this.isInitialized) return
    this.pushEvent({
      type: 'begin_checkout',
      url: '/checkout',
      cart_id: cartId,
      value,
      currency,
      timestamp: Date.now(),
    })
    this.updateLastActivity()
  }

  trackPurchase(orderId: string): void {
    if (!this.isInitialized) return
    // Only send the order ID — revenue data is tracked server-side via webhooks
    this.pushEvent({
      type: 'purchase',
      url: window.location.pathname,
      order_id: orderId,
      timestamp: Date.now(),
    })
    this.flush()
    this.updateLastActivity()
  }

  private pushEvent(event: AnalyticsEvent): void {
    this.eventQueue.push(event)
    if (this.eventQueue.length >= MAX_BATCH_SIZE) {
      this.flush()
    }
  }

  private flush(): void {
    if (this.eventQueue.length === 0 || !this.sessionId) return

    const payload: AnalyticsPayload = {
      store_id: this.storeId,
      session_id: this.sessionId,
      events: [...this.eventQueue],
    }
    this.eventQueue = []

    fetch(`${this.endpoint}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Store-Environment-ID': this.storeId,
        ...(this.publishableKey ? { 'x-publishable-api-key': this.publishableKey } : {}),
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Silently fail — analytics should never break the store
    })
  }

  private flushBeacon(): void {
    if (this.eventQueue.length === 0 || !this.sessionId) return

    const payload: AnalyticsPayload = {
      store_id: this.storeId,
      session_id: this.sessionId,
      events: [...this.eventQueue],
    }
    this.eventQueue = []

    // sendBeacon doesn't support custom headers, so use fetch with keepalive
    fetch(`${this.endpoint}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Store-Environment-ID': this.storeId,
        ...(this.publishableKey ? { 'x-publishable-api-key': this.publishableKey } : {}),
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Last resort: sendBeacon (no custom headers, may fail store routing)
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
      navigator.sendBeacon(`${this.endpoint}/events`, blob)
    })
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    const interval = getHeartbeatInterval()
    this.heartbeatTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        scheduleIdle(() => {
          this.pushEvent({
            type: 'heartbeat',
            url: window.location.pathname,
            timestamp: Date.now(),
          })
          this.updateLastActivity()
        })
      }
    }, interval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private startFlushTimer(): void {
    this.stopFlushTimer()
    this.flushTimer = setInterval(() => {
      this.flush()
    }, FLUSH_INTERVAL)
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  private getOrCreateSession(): string {
    const existingId = sessionStorage.getItem(SESSION_ID_KEY)
    const lastActivity = sessionStorage.getItem(LAST_ACTIVITY_KEY)

    if (existingId && lastActivity && !this.isSessionExpired()) {
      return existingId
    }

    const newId = crypto.randomUUID()
    sessionStorage.setItem(SESSION_ID_KEY, newId)
    this.updateLastActivity()
    return newId
  }

  private isSessionExpired(): boolean {
    const lastActivity = sessionStorage.getItem(LAST_ACTIVITY_KEY)
    if (!lastActivity) return true
    return Date.now() - parseInt(lastActivity, 10) > SESSION_TIMEOUT
  }

  private updateLastActivity(): void {
    sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString())
  }

  private getUTMParams(): { utm_source?: string; utm_medium?: string; utm_campaign?: string } {
    const params = new URLSearchParams(window.location.search)
    const result: { utm_source?: string; utm_medium?: string; utm_campaign?: string } = {}

    const source = params.get('utm_source')
    const medium = params.get('utm_medium')
    const campaign = params.get('utm_campaign')

    if (source) result.utm_source = source
    if (medium) result.utm_medium = medium
    if (campaign) result.utm_campaign = campaign

    return result
  }

  destroy(): void {
    this.stopHeartbeat()
    this.stopFlushTimer()
    this.flushBeacon()
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    window.removeEventListener('pagehide', this.handlePageHide)
    this.isInitialized = false
  }
}

let tracker: AnalyticsTracker | null = null

export function initAnalytics(): void {
  if (typeof window === 'undefined') return
  if (!tracker) tracker = new AnalyticsTracker()
  tracker.init()
}

export function trackPageView(url: string, title?: string): void {
  tracker?.trackPageView(url, title)
}

export function trackAddToCart(productId: string, variantId: string, quantity: number, value?: number): void {
  tracker?.trackAddToCart(productId, variantId, quantity, value)
}

export function trackBeginCheckout(cartId: string, value?: number, currency?: string): void {
  tracker?.trackBeginCheckout(cartId, value, currency)
}

export function trackPurchase(orderId: string): void {
  tracker?.trackPurchase(orderId)
}

export function destroyAnalytics(): void {
  tracker?.destroy()
  tracker = null
}

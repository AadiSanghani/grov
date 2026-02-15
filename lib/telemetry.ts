"use client"

export type TelemetryPayload = Record<string, unknown>

export interface TelemetryEventDetail {
  event: string
  payload: TelemetryPayload
  timestamp: string
}

declare global {
  interface Window {
    __grovTelemetry?: TelemetryEventDetail[]
  }
}

export function trackEvent(event: string, payload: TelemetryPayload = {}): void {
  if (typeof window === "undefined") return

  const detail: TelemetryEventDetail = {
    event,
    payload,
    timestamp: new Date().toISOString(),
  }

  if (!Array.isArray(window.__grovTelemetry)) {
    window.__grovTelemetry = []
  }

  window.__grovTelemetry.push(detail)
  window.dispatchEvent(new CustomEvent("grov:telemetry", { detail }))
}

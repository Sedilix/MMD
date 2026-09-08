"use client"

import React, { useEffect, useState } from 'react'
import { getConsent, setConsent } from '@/lib/site-consent'

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    try {
      if (!getConsent()) {
        setIsVisible(true)
      }
    } catch (e) {
      console.warn("Storage access failed:", e)
      setIsVisible(true) // Default to visible if storage is blocked
    }
  }, [])

  const handleAccept = () => {
    setConsent('accepted')
    setIsVisible(false)
  }

  const handleDecline = () => {
    setConsent('declined')
    setIsVisible(false)
  }

  if (!isVisible) return null

  return (
    <div className="fixed bottom-6 left-6 right-6 md:left-auto md:right-6 md:max-w-md z-50 bg-card/95 border border-white/10 shadow-lg backdrop-blur-md rounded-xl p-5 font-mono text-xs text-white animate-in fade-in slide-in-from-bottom-5 duration-500">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-white animate-ping" />
          <h4 className="font-bold tracking-wider uppercase">Telemetry & Cookie Consent</h4>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          We use essential and analytics cookies to optimize secure agent matchmaking, coordinate task nodes, and improve neural chat telemetry. Learn more in our <a href="/privacy" className="underline hover:text-white transition-colors">Privacy Policy</a>.
        </p>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={handleDecline}
            className="px-4 py-2 border border-white/20 hover:border-white/55 text-[9px] uppercase tracking-wider rounded transition-all active:scale-95 cursor-pointer"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 bg-white text-black hover:bg-white/80 text-[9px] uppercase tracking-wider rounded transition-all active:scale-95 cursor-pointer"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  )
}

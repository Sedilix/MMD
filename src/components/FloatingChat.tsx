'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { X, Minus, GripHorizontal } from 'lucide-react'

import { ChatInterface } from './chat-interface'
import { VoiceStateOrb } from '@/components/ui/VoiceStateOrb'
import { cn } from '@/lib/utils'

export function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  // fabPos represents top-left coordinates of the FAB
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null)

  const isDraggingOrb = useRef(false)
  const isDraggingHeader = useRef(false)
  const dragStart = useRef({ mouseX: 0, mouseY: 0, initFabX: 0, initFabY: 0 })
  const dragDistance = useRef(0)

  // Initialize position to bottom right
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)

      if (!mobile && typeof window !== 'undefined') {
        setFabPos((prev) => {
          if (!prev) {
            return { x: window.innerWidth - 78, y: window.innerHeight - 78 }
          }
          // Clamp inside viewport
          return {
            x: Math.max(16, Math.min(window.innerWidth - 74, prev.x)),
            y: Math.max(16, Math.min(window.innerHeight - 74, prev.y)),
          }
        })
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // ── 1. Dragging the Floating Orb ──────────────────────────────────────────
  const onOrbPointerDown = (e: React.PointerEvent) => {
    if (isMobile) return
    isDraggingOrb.current = true
    dragDistance.current = 0
    const currentX = fabPos?.x ?? (window.innerWidth - 78)
    const currentY = fabPos?.y ?? (window.innerHeight - 78)

    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initFabX: currentX,
      initFabY: currentY,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onOrbPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingOrb.current) return
    const dx = e.clientX - dragStart.current.mouseX
    const dy = e.clientY - dragStart.current.mouseY
    dragDistance.current = Math.hypot(dx, dy)

    const nextX = Math.max(16, Math.min(window.innerWidth - 74, dragStart.current.initFabX + dx))
    const nextY = Math.max(16, Math.min(window.innerHeight - 74, dragStart.current.initFabY + dy))

    setFabPos({ x: nextX, y: nextY })
  }

  const onOrbPointerUp = (e: React.PointerEvent) => {
    if (isDraggingOrb.current) {
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {}
      isDraggingOrb.current = false

      // If user merely clicked without dragging, toggle chat
      if (dragDistance.current < 6) {
        setIsOpen((v) => !v)
      }
    }
  }

  // ── 2. Dragging the Assistant Window Header ──────────────────────────────
  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (isMobile) return
    isDraggingHeader.current = true
    const currentX = fabPos?.x ?? (window.innerWidth - 78)
    const currentY = fabPos?.y ?? (window.innerHeight - 78)

    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initFabX: currentX,
      initFabY: currentY,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const onHeaderPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingHeader.current) return
    const dx = e.clientX - dragStart.current.mouseX
    const dy = e.clientY - dragStart.current.mouseY

    const nextX = Math.max(16, Math.min(window.innerWidth - 74, dragStart.current.initFabX + dx))
    const nextY = Math.max(16, Math.min(window.innerHeight - 74, dragStart.current.initFabY + dy))

    setFabPos({ x: nextX, y: nextY })
  }

  const onHeaderPointerUp = (e: React.PointerEvent) => {
    if (isDraggingHeader.current) {
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {}
      isDraggingHeader.current = false
    }
  }

  // ── Mobile: full-screen overlay ──────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        {!isOpen && (
          <button
            id="floating-chat-fab-mobile"
            onClick={() => setIsOpen(true)}
            aria-label="Open chat"
            /* Safe-area aware: viewport-fit=cover lets the FAB sit inside the
               home-indicator zone on notched phones in landscape. */
            className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-[calc(1.5rem+env(safe-area-inset-right))] z-[9999] p-0 m-0 border-0 bg-transparent rounded-full flex items-center justify-center cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:outline-none"
          >
            <VoiceStateOrb size={52} state="idle" iconSrc="/cybrdeck-logo/cybrdeck_icon_transparent.png" />
          </button>
        )}
        {isOpen && (
          <div className="fixed inset-0 z-[9999] flex flex-col bg-[#020912] h-[100dvh]">
            <div className="h-12 min-h-[48px] flex items-center justify-between px-4 border-b border-white/10 bg-white/[0.02] shrink-0">
              <div className="flex items-center gap-2">
                <Image src="/cybrdeck-logo/cybrdeck_icon_transparent.png" alt="Cybrdeck" width={18} height={18} className="object-contain" />
                <span className="text-xs font-semibold text-white tracking-wide">One Assistant</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
                className="text-zinc-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/[0.06] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatInterface />
            </div>
          </div>
        )}
      </>
    )
  }

  // Calculate panel position anchored to FAB
  const currentFabX = fabPos?.x ?? (typeof window !== 'undefined' ? window.innerWidth - 78 : 1000)
  const currentFabY = fabPos?.y ?? (typeof window !== 'undefined' ? window.innerHeight - 78 : 800)

  // Window geometry
  const panelWidth = 380
  const panelHeight = 540

  // Calculate panel coordinates with intelligent edge flipping
  let panelLeft = currentFabX + 54 - panelWidth
  if (panelLeft < 16) panelLeft = currentFabX // flip to right if near left wall
  if (typeof window !== 'undefined' && panelLeft + panelWidth > window.innerWidth - 16) {
    panelLeft = window.innerWidth - panelWidth - 16
  }

  let panelTop = currentFabY - panelHeight - 12
  if (panelTop < 16) {
    // If not enough room on top, position below orb if room, otherwise clamp to top
    panelTop = Math.max(16, currentFabY + 66)
    if (typeof window !== 'undefined' && panelTop + panelHeight > window.innerHeight - 16) {
      panelTop = 16
    }
  }

  return (
    <>
      {/* Assistant Window (Rendered at calculated floating coordinates) */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            left: `${panelLeft}px`,
            top: `${panelTop}px`,
            width: `${panelWidth}px`,
            height: `${panelHeight}px`,
            zIndex: 9998,
          }}
          className={cn(
            'overflow-hidden rounded-3xl border border-white/[0.14] bg-[#020912]/95 backdrop-blur-2xl',
            'shadow-[0_24px_80px_rgba(0,0,0,0.9),0_0_40px_rgba(216,166,87,0.08),inset_0_1px_0_0_rgba(255,255,255,0.18)]',
            'flex flex-col transition-opacity duration-200 ease-out'
          )}
        >
          {/* Top Drag Grip Bar (Freely Draggable Anywhere) */}
          <div
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={onHeaderPointerUp}
            className="h-8 flex items-center justify-between px-3.5 border-b border-white/[0.06] bg-white/[0.02] cursor-grab active:cursor-grabbing select-none shrink-0"
          >
            <div className="flex items-center gap-2 text-zinc-500">
              <GripHorizontal className="w-3.5 h-3.5 opacity-60" />
              <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500">One Assistant</span>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Minimize chat"
              className="text-zinc-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/[0.06] cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            <ChatInterface />
          </div>
        </div>
      )}

      {/* Floating Orb FAB (Freely Draggable Anywhere on X and Y) */}
      <div
        style={{
          position: 'fixed',
          left: `${currentFabX}px`,
          top: `${currentFabY}px`,
          zIndex: 9999,
        }}
        onPointerDown={onOrbPointerDown}
        onPointerMove={onOrbPointerMove}
        onPointerUp={onOrbPointerUp}
        className="cursor-grab active:cursor-grabbing select-none touch-none"
      >
        <button
          id="floating-chat-fab"
          type="button"
          aria-label={isOpen ? 'Minimize chat' : 'Open chat'}
          className="relative p-0 m-0 border-0 bg-transparent rounded-full flex items-center justify-center cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:outline-none"
        >
          <VoiceStateOrb size={54} state={isOpen ? 'listening' : 'idle'} iconSrc="/cybrdeck-logo/cybrdeck_icon_transparent.png" />
        </button>
      </div>
    </>
  )
}

"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  // ponytail: once any element enters the real Fullscreen API, the browser
  // stops painting everything outside its subtree (spec behavior, not a
  // z-index issue) — a toast mounted at the document root goes invisible.
  // Portal into whatever's currently fullscreen so warnings (e.g. the
  // "connection unstable, don't double-correct" toast in admin scoring)
  // stay visible while an operator is in fullscreen. Before mount (SSR /
  // first paint) there's no document to inspect, so just render in place —
  // identical to the pre-fix behavior.
  const [portalTarget, setPortalTarget] = useState<Element | null>(null)

  useEffect(() => {
    function sync() {
      setPortalTarget(document.fullscreenElement ?? document.body)
    }
    sync()
    document.addEventListener("fullscreenchange", sync)
    return () => document.removeEventListener("fullscreenchange", sync)
  }, [])

  const content = (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )

  if (!portalTarget) return content
  return createPortal(content, portalTarget)
}

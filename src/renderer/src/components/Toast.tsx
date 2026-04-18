import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import ReactDOM from 'react-dom'

type ToastType = 'info' | 'success' | 'error'

interface ToastMessage {
  message: string
  type: ToastType
}

type ShowToastFn = (message: string, type?: ToastType) => void

const ToastContext = createContext<ShowToastFn | null>(null)

export function useToast(): ShowToastFn {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return () => console.warn('Toast not available')
  }
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<ToastMessage | null>(null)
  const [key, setKey] = useState(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast: ShowToastFn = useCallback((msg, type = 'info') => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setMessage(null)
    setKey(k => k + 1)
    setTimeout(() => setMessage({ message: msg, type }), 10)
    timeoutRef.current = setTimeout(() => setMessage(null), 3010)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {message && ReactDOM.createPortal(
        <div
          key={key}
          className={`toast-message toast-${message.type}`}
          onClick={() => setMessage(null)}
          role="alert"
        >
          {message.message}
        </div>,
        document.body
      )}
      <style>{`
        .toast-message {
          position: fixed;
          top: 100px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.85);
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          z-index: 20000;
          font-size: 14px;
          max-width: 80%;
          word-wrap: break-word;
          cursor: pointer;
          animation: toastSlideIn 0.3s ease-out;
          animation-fill-mode: both;
        }
        .toast-success { background: rgba(34, 197, 94, 0.9); }
        .toast-error { background: rgba(239, 68, 68, 0.9); }
        .toast-info { background: rgba(36, 117, 247, 0.9); }
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

const TONES = {
  success: 'bg-slate-800 text-white',
  error: 'bg-red-600 text-white',
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  const dismiss = useCallback(() => {
    clearTimeout(timer.current)
    setToast(null)
  }, [])

  const show = useCallback(({ message, tone = 'success', action, duration = 4000 }) => {
    clearTimeout(timer.current)
    setToast({ message, tone, action })
    timer.current = setTimeout(() => setToast(null), duration)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl px-5 py-3 shadow-lg ${TONES[toast.tone]}`}
        >
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="font-semibold underline underline-offset-4"
              onClick={() => {
                dismiss()
                toast.action.onClick()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}

import { useEffect } from 'react'

export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/30 p-6 pt-24"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="關閉" className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'

// A small popover menu. `children` is a render function receiving `close`.
export default function DropdownMenu({ label, ariaLabel, caret = true, disabled = false, align = 'right', buttonClassName, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onMouseDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={buttonClassName ?? 'whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'}
      >
        {caret ? `${label} ▾` : label}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-30 mt-1 min-w-36 rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ onClick, tone = 'default', icon, children }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left hover:bg-slate-50 ${tone === 'danger' ? 'text-red-600' : 'text-slate-700'}`}
    >
      {icon}
      {children}
    </button>
  )
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const GAP = 4

// A small popover menu. `children` is a render function receiving `close`.
// The menu is portalled to <body> with fixed positioning so a scrolling/overflow
// container (e.g. the recall table) can't clip it.
export default function DropdownMenu({ label, ariaLabel, caret = true, disabled = false, align = 'right', buttonClassName, children }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const wrapperRef = useRef(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return undefined
    }
    const place = () => {
      const button = buttonRef.current?.getBoundingClientRect()
      if (!button) return
      const menuHeight = menuRef.current?.offsetHeight ?? 0
      const below = button.bottom + GAP
      // Flip above the button when there isn't room below.
      const top = below + menuHeight > window.innerHeight && button.top - GAP - menuHeight >= 0
        ? button.top - GAP - menuHeight
        : below
      setPosition(align === 'right'
        ? { top, right: window.innerWidth - button.right }
        : { top, left: button.left })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, align])

  useEffect(() => {
    if (!open) return undefined
    const onMouseDown = (event) => {
      if (!wrapperRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false)
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
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
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
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
          className="fixed z-30 min-w-36 rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-lg"
        >
          {children(() => setOpen(false))}
        </div>,
        document.body,
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

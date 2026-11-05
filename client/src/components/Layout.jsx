import { NavLink, Outlet, useNavigate } from 'react-router'
import DropdownMenu, { MenuItem } from './DropdownMenu.jsx'
import { useLogout } from '../hooks/useAuth.js'
import { useToday } from '../hooks/useRecalls.js'

export const CLINIC_NAME = '微笑牙醫診所'

function Icon({ children }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
      {children}
    </svg>
  )
}

function GearIcon() {
  return (
    <Icon>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 4.3c.4-1.7 3-1.7 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.5-.9 3.3.9 2.4 2.4a1.7 1.7 0 0 0 1 2.6c1.8.4 1.8 3 0 3.4a1.7 1.7 0 0 0-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 0 0-2.6 1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 0 0-2.6-1c-1.5.9-3.3-.9-2.4-2.4a1.7 1.7 0 0 0-1-2.6c-1.8-.4-1.8-3 0-3.4a1.7 1.7 0 0 0 1-2.6c-.9-1.5.9-3.3 2.4-2.4a1.7 1.7 0 0 0 2.6-1.1Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}

function LogoutIcon() {
  return (
    <Icon>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
    </Icon>
  )
}

function navClass({ isActive }) {
  return `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-orange-50 font-medium text-orange-600' : 'text-slate-600 hover:bg-slate-100'}`
}

export default function Layout() {
  const navigate = useNavigate()
  const logout = useLogout()
  const today = useToday()
  const todoCount = today.data?.summary.total

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">微</span>
            <span className="font-semibold text-slate-900">{CLINIC_NAME}</span>
          </div>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navClass}>
              今日待辦
              {todoCount > 0 && <span className="rounded-full bg-orange-500 px-1.5 text-xs font-semibold text-white">{todoCount}</span>}
            </NavLink>
            <NavLink to="/patients" className={navClass}>病患清單</NavLink>
          </nav>
          <div className="ml-auto">
            <DropdownMenu
              label="更多選項"
              ariaLabel="設定"
              caret={false}
              buttonClassName="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              {(close) => (
                <>
                  <MenuItem icon={<GearIcon />} onClick={() => { close(); navigate('/settings') }}>設定</MenuItem>
                  <MenuItem icon={<LogoutIcon />} onClick={() => { close(); logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) }) }}>登出</MenuItem>
                </>
              )}
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  )
}

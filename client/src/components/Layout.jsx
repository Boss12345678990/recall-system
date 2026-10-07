import { NavLink, Outlet } from 'react-router'
import { useLogout } from '../hooks/useAuth.js'

const NAV = [
  { to: '/', label: '今日待辦', end: true },
  { to: '/patients', label: '客人' },
  { to: '/import', label: '匯入' },
  { to: '/settings', label: '設定' },
]

export default function Layout() {
  const logout = useLogout()
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-8 px-6 py-4">
          <span className="text-lg font-semibold text-teal-700">回診追蹤</span>
          <nav className="flex gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-teal-50 font-medium text-teal-700' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button type="button" onClick={() => logout.mutate()} className="ml-auto text-sm text-slate-500 hover:text-slate-800">
            登出
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  )
}

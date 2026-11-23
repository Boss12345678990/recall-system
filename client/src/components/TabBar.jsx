// Underlined second-level tabs, shown under a TabBar tab (e.g. the groups inside 待辦).
export function SubTabBar({ tabs, active, counts, onChange }) {
  return (
    <div role="tablist" className="flex gap-5 border-b border-slate-200">
      {tabs.map((tab) => {
        const selected = tab.key === active
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-1 pb-2 text-sm ${selected ? 'border-orange-500 font-semibold text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {tab.label}
            <span className={`text-xs ${selected ? 'text-orange-600' : 'text-slate-400'}`}>{counts[tab.key] ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}

// Pill-style tab bar. `tabs` is [{ key, label }]; `counts` (optional) maps a tab key to a badge number.
export default function TabBar({ tabs, active, counts, onChange }) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
      {tabs.map((tab) => {
        const selected = tab.key === active
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${selected ? `font-semibold ${counts ? 'text-slate-900' : 'bg-orange-50 text-orange-700'}` : 'text-slate-500 hover:text-slate-800'}`}
          >
            {tab.label}
            {counts && (
              <span className={`rounded-full px-1.5 text-xs ${selected ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {counts[tab.key] ?? 0}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

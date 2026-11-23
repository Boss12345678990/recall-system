import { useState } from 'react'
import { useSearchParams } from 'react-router'
import Button from '../components/Button.jsx'
import PageMessage from '../components/PageMessage.jsx'
import RecallTable from '../components/RecallTable.jsx'
import RecallRowActions from '../components/RecallRowActions.jsx'
import { inputClass } from '../components/Field.jsx'
import TabBar, { SubTabBar } from '../components/TabBar.jsx'
import RegisterVisitDialog from '../components/RegisterVisitDialog.jsx'
import { useRecallAction, useRecallList, useRestartRecall, useToday } from '../hooks/useRecalls.js'
import { formatLongDate } from '../utils/recallDisplay.js'

export const TABS = [
  { key: 'todo', label: '待辦', empty: '今天沒有需要聯絡的病患' },
  { key: 'confirmed', label: '已確認', empty: '目前沒有已確認複診的病患' },
  { key: 'import-overdue', label: '聯絡不上', empty: '目前沒有聯絡不上的病患' },
]

// The three groups of today's list, as sub-tabs of 待辦.
export const TODO_VIEWS = [
  { key: 'todo', label: '待處理', empty: '今天沒有需要聯絡的病患', match: (item) => item.haveAction },
  { key: 'done', label: '今日已完成', empty: '今天還沒有完成的聯絡', match: (item) => Boolean(item.completedToday) },
  { key: 'waiting', label: '等待回覆', empty: '目前沒有等待回覆的病患', match: (item) => item.waiting },
]

const matchesName = (term) => (item) => item.patient.name.includes(term)

const STAT_TONES = {
  plain: { box: 'border-slate-200', value: 'text-slate-900' },
  orange: { box: 'border-slate-200', value: 'text-orange-600' },
  red: { box: 'border-red-200', value: 'text-red-600' },
}

function StatCard({ label, value, tone = 'plain' }) {
  return (
    <div className={`w-28 rounded-xl border bg-white px-4 py-3 ${STAT_TONES[tone].box}`}>
      <p className={`text-xs ${tone === 'red' ? 'text-red-500' : 'text-slate-500'}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold ${STAT_TONES[tone].value}`}>{value}</p>
    </div>
  )
}

export default function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const tab = TABS.some((t) => t.key === requested) ? requested : 'todo'
  const requestedView = searchParams.get('view')
  const view = TODO_VIEWS.find((v) => v.key === requestedView) ?? TODO_VIEWS[0]
  const [search, setSearch] = useState('')
  const term = search.trim()

  const today = useToday()
  const list = useRecallList(tab, { enabled: tab !== 'todo' })
  const action = useRecallAction()
  const restart = useRestartRecall()
  const [registering, setRegistering] = useState(false)

  if (today.isPending) return <PageMessage>載入中…</PageMessage>
  if (today.isError) return <PageMessage tone="error">{today.error.message}</PageMessage>

  const { today: date, summary, progress, counts, items } = today.data
  const todo = items.filter((item) => item.haveAction)
  const sendLine = todo.filter((item) => item.nextAction.action === 'SEND_LINE').length
  const busy = action.isPending || restart.isPending
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)
  const activeTab = TABS.find((t) => t.key === tab)

  const renderActions = (item) => (
    <RecallRowActions
      item={item}
      today={date}
      showPrimary={tab === 'todo'}
      disabled={busy}
      onAction={(selected, extra) => action.mutate({ id: item.id, action: selected, version: item.version, ...extra })}
      onReschedule={(dueDate) => restart.mutate({ id: item.id, dueDate, version: item.version })}
    />
  )

  // While searching, sub-tab counts show matches, so staff can see which group the patient is in.
  const searched = term ? items.filter(matchesName(term)) : items
  const viewCounts = Object.fromEntries(TODO_VIEWS.map((v) => [v.key, searched.filter(v.match).length]))
  const filterRows = (rows, emptyText) => {
    if (!term) return { rows, emptyText }
    return { rows: rows.filter(matchesName(term)), emptyText: `找不到姓名含「${term}」的病患` }
  }

  let body
  if (tab === 'todo') {
    const { rows, emptyText } = filterRows(items.filter(view.match), view.empty)
    body = <RecallTable items={rows} today={date} renderActions={renderActions} emptyText={emptyText} />
  } else if (list.isPending) {
    body = <PageMessage>載入中…</PageMessage>
  } else if (list.isError) {
    body = <PageMessage tone="error">{list.error.message}</PageMessage>
  } else {
    const { rows, emptyText } = filterRows(list.data.items, activeTab.empty)
    body = (
      <RecallTable items={rows} today={date} renderActions={renderActions} emptyText={emptyText}
        compact={tab === 'confirmed'} />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm text-slate-400">{formatLongDate(date)}</p>
          <div className="mt-1 flex items-center gap-4">
            <h1 className="text-2xl font-bold">今日待辦</h1>
            <Button variant="secondary" size="sm" onClick={() => setRegistering(true)}>＋ 登記今日看診</Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-slate-500">
        <span className="whitespace-nowrap">今日進度 <strong className="text-slate-800">{progress.done} / {progress.total}</strong></span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <TabBar
          tabs={TABS}
          active={tab}
          counts={{ todo: summary.total, ...counts }}
          onChange={(key) => setSearchParams(key === 'todo' ? {} : { tab: key })}
        />
        <label className="w-full sm:w-64">
          <span className="sr-only">搜尋病患姓名</span>
          <input type="search" className={inputClass} placeholder="搜尋病患姓名" value={search}
            onChange={(event) => setSearch(event.target.value)} />
        </label>
      </div>

      {tab === 'todo' && (
        <SubTabBar
          tabs={TODO_VIEWS}
          active={view.key}
          counts={viewCounts}
          onChange={(key) => setSearchParams(key === 'todo' ? {} : { view: key })}
        />
      )}

      {body}

      {registering && <RegisterVisitDialog onClose={() => setRegistering(false)} />}
    </div>
  )
}

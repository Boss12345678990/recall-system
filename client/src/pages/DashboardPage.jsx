import { useState } from 'react'
import { useSearchParams } from 'react-router'
import Button from '../components/Button.jsx'
import PageMessage from '../components/PageMessage.jsx'
import RecallTable from '../components/RecallTable.jsx'
import RecallRowActions from '../components/RecallRowActions.jsx'
import RegisterVisitDialog from '../components/RegisterVisitDialog.jsx'
import {
  useMarkUnreachable, useRecallAction, useRecallList, useRestartRecall, useToday,
} from '../hooks/useRecalls.js'
import { formatLongDate } from '../utils/recallDisplay.js'

export const TABS = [
  { key: 'todo', label: '待辦', empty: '今天沒有需要聯絡的病患' },
  { key: 'waiting', label: '等待回覆', empty: '目前沒有等待回覆的病患' },
  { key: 'confirmed', label: '已確認', empty: '目前沒有已確認複診的病患' },
  { key: 'unreachable', label: '無法聯絡', empty: '目前沒有無法聯絡的病患' },
  { key: 'import-overdue', label: '待重新追蹤', empty: '目前沒有待重新追蹤的病患' },
]

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

function TabBar({ active, counts, onChange }) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
      {TABS.map((tab) => {
        const selected = tab.key === active
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${selected ? 'font-semibold text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {tab.label}
            <span className={`rounded-full px-1.5 text-xs ${selected ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {counts[tab.key] ?? 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const tab = TABS.some((t) => t.key === requested) ? requested : 'todo'

  const today = useToday()
  const list = useRecallList(tab, { enabled: tab !== 'todo' })
  const action = useRecallAction()
  const restart = useRestartRecall()
  const markUnreachable = useMarkUnreachable()
  const [registering, setRegistering] = useState(false)

  if (today.isPending) return <PageMessage>載入中…</PageMessage>
  if (today.isError) return <PageMessage tone="error">{today.error.message}</PageMessage>

  const { today: date, summary, progress, counts, items } = today.data
  const sendLine = items.filter((item) => item.nextAction.action === 'SEND_LINE').length
  const busy = action.isPending || restart.isPending || markUnreachable.isPending
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)
  const activeTab = TABS.find((t) => t.key === tab)

  const renderActions = (item) => (
    <RecallRowActions
      item={item}
      today={date}
      showPrimary={tab === 'todo'}
      disabled={busy}
      onAction={(selected) => action.mutate({ id: item.id, action: selected, version: item.version })}
      onReschedule={(dueDate) => restart.mutate({ id: item.id, dueDate, version: item.version })}
      onMarkUnreachable={() => markUnreachable.mutate({ id: item.id, version: item.version })}
    />
  )

  let body
  if (tab === 'todo') {
    body = <RecallTable items={items} today={date} renderActions={renderActions} emptyText={activeTab.empty} />
  } else if (list.isPending) {
    body = <PageMessage>載入中…</PageMessage>
  } else if (list.isError) {
    body = <PageMessage tone="error">{list.error.message}</PageMessage>
  } else {
    body = <RecallTable items={list.data.items} today={date} renderActions={renderActions} emptyText={activeTab.empty} />
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
        <div className="flex gap-3">
          <StatCard label="待傳 LINE" value={sendLine} />
          <StatCard label="待撥電話" value={items.length - sendLine} tone="orange" />
          <StatCard label="逾期未確認" value={summary.overdue} tone="red" />
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-slate-500">
        <span className="whitespace-nowrap">今日進度 <strong className="text-slate-800">{progress.done} / {progress.total}</strong></span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <TabBar
        active={tab}
        counts={{ todo: summary.total, ...counts }}
        onChange={(key) => setSearchParams(key === 'todo' ? {} : { tab: key })}
      />

      {body}

      {registering && <RegisterVisitDialog onClose={() => setRegistering(false)} />}
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router'
import Button from '../components/Button.jsx'
import PageMessage from '../components/PageMessage.jsx'
import RecallCard from '../components/RecallCard.jsx'
import ActionButtons from '../components/ActionButtons.jsx'
import RegisterVisitDialog from '../components/RegisterVisitDialog.jsx'
import { useRecallAction, useToday } from '../hooks/useRecalls.js'

export const RECALL_LISTS = [
  { key: 'confirmed-no-show', label: '確認但未到' },
  { key: 'import-overdue', label: '匯入時已過期' },
  { key: 'unreachable', label: '聯絡不上' },
]

export default function DashboardPage() {
  const today = useToday()
  const action = useRecallAction()
  const [registering, setRegistering] = useState(false)

  if (today.isPending) return <PageMessage>載入中…</PageMessage>
  if (today.isError) return <PageMessage tone="error">{today.error.message}</PageMessage>

  const { summary, counts, items } = today.data

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-lg">
          今天要聯絡 <strong>{summary.total}</strong> 人
          {summary.overdue > 0 && <span className="font-semibold text-red-600"> · 逾期 {summary.overdue} 人</span>}
        </p>
        <Button onClick={() => setRegistering(true)}>＋ 登記今日看診</Button>
      </section>

      {items.length === 0 ? (
        <PageMessage>今天沒有需要聯絡的客人</PageMessage>
      ) : (
        <div className="space-y-5">
          {items.map((item) => (
            <RecallCard key={item.id} item={item}>
              <ActionButtons
                recall={item}
                hasLine={item.patient.hasLine}
                disabled={action.isPending}
                onAction={(selected) => action.mutate({ id: item.id, action: selected, version: item.version })}
              />
            </RecallCard>
          ))}
        </div>
      )}

      <nav className="flex flex-wrap justify-center gap-8 pt-4 text-sm">
        {RECALL_LISTS.map((list) => (
          <Link key={list.key} to={`/lists/${list.key}`} className="text-slate-500 hover:text-teal-700">
            {list.label} ({counts[list.key]})
          </Link>
        ))}
      </nav>

      {registering && <RegisterVisitDialog onClose={() => setRegistering(false)} />}
    </div>
  )
}

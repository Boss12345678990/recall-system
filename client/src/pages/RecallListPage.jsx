import { Link, Navigate, useParams } from 'react-router'
import PageMessage from '../components/PageMessage.jsx'
import RecallCard from '../components/RecallCard.jsx'
import RestartControl from '../components/RestartControl.jsx'
import { useRecallList, useRestartRecall } from '../hooks/useRecalls.js'
import { useSettings } from '../hooks/useSettings.js'
import { addDaysLocal, todayLocal } from '../utils/format.js'

const HINTS = {
  'confirmed-no-show': { title: '確認但未到', hint: '已確認複診，但回診日已過、還沒有新的看診紀錄。' },
  'import-overdue': { title: '匯入時已過期', hint: '匯入時回診日已經過了。按「重新追蹤」設定新的回診日後，就會進入今日待辦。' },
  unreachable: { title: '聯絡不上', hint: '打 3 次都沒接，或客人表示不回診。' },
}

export default function RecallListPage() {
  const { list } = useParams()
  const meta = HINTS[list]
  const query = useRecallList(list, { enabled: Boolean(meta) })
  const settings = useSettings()
  const restart = useRestartRecall()

  if (!meta) return <Navigate to="/" replace />

  const defaultDate = addDaysLocal(todayLocal(), settings.data?.lineLeadDays ?? 7)

  return (
    <div className="space-y-8">
      <div>
        <Link to="/" className="text-sm text-slate-500 hover:text-teal-700">← 今日待辦</Link>
        <h1 className="mt-3 text-xl font-semibold">{meta.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{meta.hint}</p>
      </div>
      {query.isPending && <PageMessage>載入中…</PageMessage>}
      {query.isError && <PageMessage tone="error">{query.error.message}</PageMessage>}
      {query.isSuccess && query.data.items.length === 0 && <PageMessage>目前沒有資料</PageMessage>}
      {query.isSuccess && (
        <div className="space-y-5">
          {query.data.items.map((item) => (
            <RecallCard key={item.id} item={item}>
              <RestartControl
                defaultDate={defaultDate}
                disabled={restart.isPending}
                onRestart={(dueDate) => restart.mutate({ id: item.id, dueDate, version: item.version })}
              />
            </RecallCard>
          ))}
        </div>
      )}
    </div>
  )
}

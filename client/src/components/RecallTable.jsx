import RecallRow from './RecallRow.jsx'

const FULL_HEADERS = ['病患', '上次回診日', '預計回診日', '距離回診日', '提醒進度 / 上次聯絡', '動作']
const COMPACT_HEADERS = ['病患', '上次回診日', '預計回診日', '動作']

// `renderActions(item)` returns the content of the 動作 cell. `compact` keeps only the
// patient, the two dates and the actions (已確認 tab).
export default function RecallTable({ items, today, renderActions, emptyText, compact = false }) {
  if (items.length === 0) {
    return <p className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-500">{emptyText}</p>
  }
  const headers = compact ? COMPACT_HEADERS : FULL_HEADERS
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className={`w-full text-left ${compact ? 'min-w-[640px]' : 'min-w-[960px]'}`}>
        <thead>
          <tr className="text-xs text-slate-400">
            {headers.map((header, index) => (
              <th key={header} className={`py-3 font-normal ${index === 0 ? 'pl-5 pr-3' : 'px-3'} ${index === headers.length - 1 ? 'pr-5 text-right' : ''}`}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <RecallRow key={item.id} item={item} today={today} compact={compact}>
              {/* Buttons, menus and dialogs here must not also open the patient. */}
              <td className="cursor-default py-3 pl-3 pr-5" onClick={(event) => event.stopPropagation()}>{renderActions(item)}</td>
            </RecallRow>
          ))}
        </tbody>
      </table>
    </div>
  )
}

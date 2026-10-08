import RecallRow from './RecallRow.jsx'

const HEADERS = ['病患', '回診日', '倒數', '提醒進度 / 上次聯絡', '動作']

// `renderActions(item)` returns the content of the 動作 cell.
export default function RecallTable({ items, today, renderActions, emptyText }) {
  if (items.length === 0) {
    return <p className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-500">{emptyText}</p>
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[860px] text-left">
        <thead>
          <tr className="text-xs text-slate-400">
            {HEADERS.map((header, index) => (
              <th key={header} className={`py-3 font-normal ${index === 0 ? 'pl-5 pr-3' : 'px-3'} ${index === HEADERS.length - 1 ? 'pr-5 text-right' : ''}`}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <RecallRow key={item.id} item={item} today={today}>
              <td className="py-3 pl-3 pr-5">{renderActions(item)}</td>
            </RecallRow>
          ))}
        </tbody>
      </table>
    </div>
  )
}

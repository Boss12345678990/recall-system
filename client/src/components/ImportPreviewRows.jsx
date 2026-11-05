import { formatDate } from '../utils/format.js'

function describeError({ column, message }) {
  return message.startsWith(column) ? message : `${column}：${message}`
}

export function ErrorRows({ rows }) {
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {rows.map((row) => (
        <li key={row.rowNumber}>
          {`第 ${row.rowNumber} 列${row.raw.name ? `（${row.raw.name}）` : ''}：${row.errors.map(describeError).join('、')}`}
        </li>
      ))}
    </ul>
  )
}

export function ValidRows({ rows }) {
  return (
    <details className="mt-6 text-sm">
      <summary className="cursor-pointer text-slate-600">
        {`查看可匯入的資料（${rows.length}）— 請確認生日與看診日是否正確`}
      </summary>
      <ul className="mt-3 space-y-1 text-slate-600">
        {rows.map((row) => (
          <li key={row.rowNumber}>
            {`第 ${row.rowNumber} 列 ${row.data.name} · 生日 ${formatDate(row.data.birthDate)} · 上次看診 ${formatDate(row.data.lastVisitDate)} · 回診日 ${formatDate(row.dueDate)}${row.onHold ? '（已過期）' : ''}`}
          </li>
        ))}
      </ul>
    </details>
  )
}

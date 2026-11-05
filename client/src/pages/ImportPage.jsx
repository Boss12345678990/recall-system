import { useState } from 'react'
import { Link } from 'react-router'
import Button from '../components/Button.jsx'
import { ErrorRows, ValidRows } from '../components/ImportPreviewRows.jsx'
import { useCommitImport, usePreviewImport } from '../hooks/useImport.js'
import { formatDate } from '../utils/format.js'

function Step({ number, title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-semibold"><span className="mr-2 text-orange-600">{number}</span>{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function ImportPage() {
  const preview = usePreviewImport()
  const commit = useCommitImport()
  const [fileName, setFileName] = useState('')

  const data = preview.data
  const validRows = data?.rows.filter((row) => row.status === 'valid') ?? []
  const errorRows = data?.rows.filter((row) => row.status === 'error') ?? []
  const duplicateRows = data?.rows.filter((row) => row.status.startsWith('duplicate')) ?? []

  const onFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setFileName(file.name)
    commit.reset()
    preview.mutate(file)
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">匯入病患資料</h1>

      <Step number="1" title="下載範本">
        <p className="text-sm text-slate-600">範本有「姓名、生日、電話、上次看診日、有加 LINE、備註」六欄。日期可以寫 1990-01-31、1990/1/31 或民國 79/1/31。</p>
        <a href="/api/imports/template" download className="mt-4 inline-block text-sm font-medium text-orange-700 underline">下載範本 Excel</a>
      </Step>

      <Step number="2" title="上傳填好的檔案">
        <label className="inline-flex cursor-pointer items-center gap-3">
          <span className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">選擇檔案</span>
          <span className="text-sm text-slate-500">{fileName || '尚未選擇'}</span>
          <input type="file" accept=".xlsx" className="hidden" onChange={onFile} />
        </label>
        {preview.isPending && <p className="mt-4 text-sm text-slate-500">讀取中…</p>}
        {preview.error && <p className="mt-4 text-sm text-red-600">{preview.error.message}</p>}
      </Step>

      {data && !commit.isSuccess && (
        <Step number="3" title="確認預覽">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-orange-50 px-3 py-1 text-orange-700">可匯入 {data.summary.valid} 筆（其中 {data.summary.onHold} 筆已過期）</span>
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-600">有錯誤 {data.summary.error} 筆</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">重複 {data.summary.duplicate} 筆（不會匯入）</span>
          </div>

          {errorRows.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-medium text-red-600">以下資料有錯誤，請修正 Excel 後重新上傳，或直接匯入其他正確的資料：</p>
              <ErrorRows rows={errorRows} />
            </div>
          )}

          {validRows.length > 0 && <ValidRows rows={validRows} />}

          {duplicateRows.length > 0 && (
            <details className="mt-6 text-sm">
              <summary className="cursor-pointer text-slate-600">查看重複的資料（{duplicateRows.length}）</summary>
              <ul className="mt-3 space-y-1 text-slate-500">
                {duplicateRows.map((row) => (
                  <li key={row.rowNumber}>
                    第 {row.rowNumber} 列 {row.data.name}（{formatDate(row.data.birthDate)}）—
                    {row.status === 'duplicate-existing' ? '系統中已有這位病患' : '檔案中重複出現'}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {commit.error && <p className="mt-6 text-sm text-red-600">{commit.error.message}</p>}
          <div className="mt-6 flex justify-end">
            <Button disabled={validRows.length === 0 || commit.isPending}
              onClick={() => commit.mutate(validRows.map((row) => row.data))}>
              {commit.isPending ? '匯入中…' : `確認匯入 ${validRows.length} 筆`}
            </Button>
          </div>
        </Step>
      )}

      {commit.isSuccess && (
        <Step number="✓" title="匯入完成">
          <p>已匯入 {commit.data.imported} 筆。</p>
          {commit.data.onHold > 0 && (
            <p className="mt-2 text-sm text-slate-600">
              其中 {commit.data.onHold} 筆回診日已過，放在
              <Link to="/?tab=import-overdue" className="mx-1 text-orange-700 underline">待重新追蹤</Link>
              清單，有空時再逐一重新追蹤。
            </p>
          )}
        </Step>
      )}
    </div>
  )
}

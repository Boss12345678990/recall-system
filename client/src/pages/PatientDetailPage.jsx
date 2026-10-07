import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import Button from '../components/Button.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import PageMessage from '../components/PageMessage.jsx'
import PatientForm from '../components/PatientForm.jsx'
import RecallEditor from '../components/RecallEditor.jsx'
import RecallTimeline from '../components/RecallTimeline.jsx'
import { useDeletePatient, useDeleteVisit, usePatient, useRecordVisit, useUpdatePatient } from '../hooks/usePatients.js'
import { describeEvent } from '../utils/describeEvent.js'
import { formatDate, formatDateTime } from '../utils/format.js'

function Section({ title, action, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export default function PatientDetailPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const query = usePatient(id)
  const updatePatient = useUpdatePatient()
  const deletePatient = useDeletePatient()
  const recordVisit = useRecordVisit()
  const deleteVisit = useDeleteVisit()
  const [confirming, setConfirming] = useState(null) // 'patient' | visit object

  if (query.isPending) return <PageMessage>載入中…</PageMessage>
  if (query.isError) return <PageMessage tone="error">{query.error.message}</PageMessage>

  const patient = query.data
  const recall = patient.currentRecall
  const latestVisit = patient.visits[0]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/patients" className="text-sm text-slate-500 hover:text-teal-700">← 客人</Link>
          <h1 className="mt-3 text-2xl font-semibold">{patient.name}</h1>
        </div>
        <Button variant="ghost" onClick={() => setConfirming('patient')}>刪除客人</Button>
      </div>

      <Section
        title="目前回診追蹤"
        action={<Button disabled={recordVisit.isPending} onClick={() => recordVisit.mutate({ patientId: id })}>登記今日看診</Button>}
      >
        {recall ? (
          <div className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
            <RecallTimeline recall={recall} hasLine={patient.hasLine} />
            <RecallEditor recall={recall} />
          </div>
        ) : (
          <p className="text-slate-500">尚無回診追蹤，登記看診後會自動建立。</p>
        )}
      </Section>

      <Section title="基本資料">
        <PatientForm
          key={patient.updatedAt}
          initial={patient}
          submitLabel="儲存"
          pending={updatePatient.isPending}
          error={updatePatient.error}
          onSubmit={(data) => updatePatient.mutate({ id, ...data })}
        />
      </Section>

      <Section title="看診紀錄">
        {patient.visits.length === 0 ? (
          <p className="text-slate-500">尚無看診紀錄</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {patient.visits.map((visit) => (
              <li key={visit.id} className="flex items-center justify-between py-3">
                <span>{formatDate(visit.visitDate)}{visit.note && <span className="ml-3 text-sm text-slate-500">{visit.note}</span>}</span>
                {visit.id === latestVisit.id && (
                  <Button variant="ghost" onClick={() => setConfirming(visit)}>刪除</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <details className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <summary className="cursor-pointer font-semibold">修改紀錄（{patient.events.length}）</summary>
        <ul className="mt-5 space-y-4">
          {patient.events.map((event) => {
            const { title, lines } = describeEvent(event)
            return (
              <li key={event.id} className="text-sm">
                <p><span className="font-medium">{title}</span><span className="ml-3 text-slate-400">{formatDateTime(event.createdAt)}</span></p>
                {lines.map((line) => <p key={line} className="mt-1 text-slate-600">{line}</p>)}
              </li>
            )
          })}
        </ul>
      </details>

      {confirming === 'patient' && (
        <ConfirmDialog
          title="刪除客人"
          message={`確定要刪除「${patient.name}」嗎？所有看診與回診追蹤紀錄都會一起刪除，無法復原。`}
          confirmLabel="刪除"
          pending={deletePatient.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() => deletePatient.mutate(id, { onSuccess: () => navigate('/patients') })}
        />
      )}
      {confirming && confirming !== 'patient' && (
        <ConfirmDialog
          title="刪除看診紀錄"
          message={`確定要刪除 ${formatDate(confirming.visitDate)} 的看診紀錄嗎？這次看診產生的回診追蹤會一起刪除，上一筆追蹤會恢復原狀。`}
          confirmLabel="刪除"
          pending={deleteVisit.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() => deleteVisit.mutate(confirming.id, { onSuccess: () => setConfirming(null) })}
        />
      )}
    </div>
  )
}

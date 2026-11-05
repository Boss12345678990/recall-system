import { useEffect, useState } from 'react'
import Button from '../components/Button.jsx'
import Field, { inputClass } from '../components/Field.jsx'
import PageMessage from '../components/PageMessage.jsx'
import { useToast } from '../components/Toast.jsx'
import { useChangePassword } from '../hooks/useAuth.js'
import { useSettings, useUpdateSettings } from '../hooks/useSettings.js'

const FIELDS = [
  { key: 'recallIntervalMonths', label: '回診間隔（個月）', min: 1, max: 24, hint: '看診日往後推幾個月為下次回診日，只影響之後登記的看診' },
  { key: 'lineLeadDays', label: '提前傳 LINE（天）', min: 1, max: 30, hint: '回診日前幾天傳 LINE 提醒' },
  { key: 'callAfterLineDays', label: '傳 LINE 後打電話（天）', min: 1, max: 14, hint: '傳 LINE 後幾天沒確認就打電話' },
  { key: 'callGapDays', label: '電話間隔（天）', min: 1, max: 14, hint: '電話沒接後隔幾天再打' },
]

function fieldError(error, field) {
  return Array.isArray(error?.details) ? error.details.find((d) => d.field === field)?.message : undefined
}

function RecallSettingsForm({ settings }) {
  const update = useUpdateSettings()
  const [form, setForm] = useState(settings)
  useEffect(() => setForm(settings), [settings])

  const changes = Object.fromEntries(
    FIELDS.filter(({ key }) => Number(form[key]) !== settings[key]).map(({ key }) => [key, Number(form[key])]),
  )

  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); update.mutate(changes) }}>
      <div className="grid gap-5 sm:grid-cols-2">
        {FIELDS.map(({ key, label, min, max, hint }) => (
          <Field key={key} label={label} hint={hint} error={fieldError(update.error, key)}>
            <input className={inputClass} type="number" min={min} max={max} required value={form[key]}
              onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
          </Field>
        ))}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={Object.keys(changes).length === 0 || update.isPending}>儲存設定</Button>
      </div>
    </form>
  )
}

function PasswordForm() {
  // const changePassword = useChangePassword()
  // const toast = useToast()
  // const empty = { currentPassword: '', newPassword: '', confirmPassword: '' }
  // const [form, setForm] = useState(empty)
  // const mismatch = form.confirmPassword !== '' && form.newPassword !== form.confirmPassword

  // const submit = (event) => {
  //   event.preventDefault()
  //   if (mismatch) return
  //   changePassword.mutate(
  //     { currentPassword: form.currentPassword, newPassword: form.newPassword },
  //     { onSuccess: () => { setForm(empty); toast.show({ message: '密碼已更新' }) } },
  //   )
  // }
  // const update = (key) => (event) => setForm({ ...form, [key]: event.target.value })

  // return (
  //   <form className="space-y-5" onSubmit={submit}>
  //     <div className="grid gap-5 sm:grid-cols-3">
  //       <Field label="目前密碼">
  //         <input className={inputClass} type="password" autoComplete="current-password" required value={form.currentPassword} onChange={update('currentPassword')} />
  //       </Field>
  //       <Field label="新密碼" hint="至少 8 個字元">
  //         <input className={inputClass} type="password" autoComplete="new-password" required value={form.newPassword} onChange={update('newPassword')} />
  //       </Field>
  //       <Field label="再輸入一次新密碼" error={mismatch ? '兩次輸入的新密碼不一致' : undefined}>
  //         <input className={inputClass} type="password" autoComplete="new-password" required value={form.confirmPassword} onChange={update('confirmPassword')} />
  //       </Field>
  //     </div>
  //     {changePassword.error && <p className="text-sm text-red-600">{changePassword.error.message}</p>}
  //     <div className="flex justify-end">
  //       <Button type="submit" disabled={mismatch || changePassword.isPending}>更新密碼</Button>
  //     </div>
  //   </form>
  // )
}

export default function SettingsPage() {
  const settings = useSettings()
  if (settings.isPending) return <PageMessage>載入中…</PageMessage>
  if (settings.isError) return <PageMessage tone="error">{settings.error.message}</PageMessage>

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">設定</h1>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 font-semibold">回診提醒</h2>
        <RecallSettingsForm settings={settings.data} />
      </section>
      {/* <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 font-semibold">修改登入密碼</h2>
        <PasswordForm />
      </section> */}
    </div>
  )
}

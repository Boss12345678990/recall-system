import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useLogin } from '../hooks/useAuth.js'
import Button from '../components/Button.jsx'
import Field, { inputClass } from '../components/Field.jsx'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useLogin()
  const [form, setForm] = useState({ username: '', password: '' })

  const submit = (event) => {
    event.preventDefault()
    login.mutate(form, { onSuccess: () => navigate('/', { replace: true }) })
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-xl font-semibold text-teal-700">回診追蹤系統</h1>
        <Field label="帳號">
          <input className={inputClass} autoComplete="username" value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </Field>
        <Field label="密碼">
          <input className={inputClass} type="password" autoComplete="current-password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {login.error && <p className="text-sm text-red-600">{login.error.message}</p>}
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? '登入中…' : '登入'}
        </Button>
      </form>
    </div>
  )
}

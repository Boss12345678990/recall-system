export const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100'

export default function Field({ label, error, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  )
}

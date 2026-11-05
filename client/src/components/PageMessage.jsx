export default function PageMessage({ tone = 'muted', children }) {
  const color = tone === 'error' ? 'text-red-600' : 'text-slate-500'
  return <p className={`py-16 text-center ${color}`}>{children}</p>
}

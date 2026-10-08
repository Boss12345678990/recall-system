const VARIANTS = {
  primary: 'bg-orange-500 text-white hover:bg-orange-600',
  success: 'bg-green-700 text-white hover:bg-green-800',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-slate-500 hover:text-slate-800',
}

const SIZES = {
  md: 'rounded-xl px-4 py-2 text-sm',
  sm: 'rounded-lg px-3 py-1.5 text-xs',
}

export default function Button({ variant = 'primary', size = 'md', type = 'button', className = '', ...props }) {
  return (
    <button
      type={type}
      className={`whitespace-nowrap font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

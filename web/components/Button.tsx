interface ButtonProps {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'danger' | 'success'
  children: React.ReactNode
  className?: string
}

const variants = {
  primary:   'bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white shadow-sm',
  secondary: 'bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-700 text-zinc-200 border border-zinc-700',
  danger:    'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white',
  success:   'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white',
}

export default function Button({ onClick, disabled, loading, variant = 'primary', children, className = '' }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`min-h-[48px] px-5 py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-150
        disabled:!bg-zinc-800 disabled:!text-zinc-600 disabled:!border-zinc-700 disabled:!shadow-none disabled:cursor-not-allowed
        flex items-center justify-center gap-2 ${variants[variant]} ${className}`}
    >
      {loading && (
        <span className="inline-block w-4 h-4 border-2 border-zinc-600/40 border-t-zinc-400 rounded-full animate-spin" aria-hidden="true" />
      )}
      {children}
    </button>
  )
}

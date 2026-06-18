interface ButtonProps {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
  children: React.ReactNode
  className?: string
}

const variants = {
  primary: 'bg-cf-blue hover:bg-blue-700 text-white',
  secondary: 'bg-gray-700 hover:bg-gray-600 text-white',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
}

export default function Button({ onClick, disabled, loading, variant = 'primary', children, className = '' }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`min-h-[48px] px-5 py-3 rounded-xl text-base font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${variants[variant]} ${className}`}
    >
      {loading && (
        <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
      )}
      {children}
    </button>
  )
}

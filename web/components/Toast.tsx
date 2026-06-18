interface ToastProps {
  message: string
  type: 'success' | 'error'
}

export default function Toast({ message, type }: ToastProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`fixed top-16 right-3 left-3 sm:left-auto sm:w-auto sm:max-w-sm z-50 px-4 py-3 rounded-2xl shadow-2xl text-sm font-medium animate-slide-in flex items-center gap-2.5 ${
        type === 'success'
          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
          : 'bg-red-500/10 text-red-300 border border-red-500/30'
      }`}
      style={{ backdropFilter: 'blur(12px)' }}
    >
      <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
        type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
      }`}>
        {type === 'success' ? '✓' : '✗'}
      </span>
      <span className="flex-1 min-w-0">{message}</span>
    </div>
  )
}

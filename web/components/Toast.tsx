interface ToastProps {
  message: string
  type: 'success' | 'error' | 'warning'
}

const STYLE: Record<ToastProps['type'], string> = {
  success: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30',
  error: 'bg-red-500/10 text-red-300 border border-red-500/30',
  warning: 'bg-amber-500/10 text-amber-300 border border-amber-500/30',
}

const ICON_STYLE: Record<ToastProps['type'], string> = {
  success: 'bg-emerald-500 text-white',
  error: 'bg-red-500 text-white',
  warning: 'bg-amber-500 text-white',
}

const ICON: Record<ToastProps['type'], string> = {
  success: '✓',
  error: '✗',
  warning: '⚠',
}

export default function Toast({ message, type }: ToastProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`fixed top-16 right-3 left-3 sm:left-auto sm:w-auto sm:max-w-sm z-50 px-4 py-3 rounded-2xl shadow-2xl text-sm font-medium animate-slide-in flex items-center gap-2.5 ${STYLE[type]}`}
      style={{ backdropFilter: 'blur(12px)' }}
    >
      <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${ICON_STYLE[type]}`}>
        {ICON[type]}
      </span>
      <span className="flex-1 min-w-0">{message}</span>
    </div>
  )
}

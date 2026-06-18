interface ToastProps {
  message: string
  type: 'success' | 'error'
}

export default function Toast({ message, type }: ToastProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`fixed top-16 right-4 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-medium max-w-[calc(100vw-2rem)] animate-slide-in ${
        type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
      }`}
    >
      <span className="mr-2">{type === 'success' ? '✓' : '✗'}</span>
      {message}
    </div>
  )
}

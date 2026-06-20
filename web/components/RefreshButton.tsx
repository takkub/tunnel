interface Props { onClick: () => void; disabled?: boolean; loading?: boolean }

export default function RefreshButton({ onClick, disabled, loading }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      aria-label="รีเฟรช"
      className="w-10 h-10 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-40 flex-shrink-0"
    >
      <svg
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
      >
        <path d="M23 4v6h-6" />
        <path d="M1 20v-6h6" />
        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
      </svg>
    </button>
  )
}

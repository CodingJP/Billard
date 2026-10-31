import { useEffect, useState } from 'react'
import { onToast } from '../toast.ts'
import { CheckIcon } from './icons.tsx'

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = onToast((m) => {
      setMessage(m)
      setVisible(true)
      clearTimeout(timer)
      timer = setTimeout(() => setVisible(false), 2600)
    })
    return () => {
      off()
      clearTimeout(timer)
    }
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center gap-2.5 rounded-2xl bg-fg px-4 py-3 text-sm font-semibold text-bg shadow-lg transition duration-300 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <CheckIcon size={18} className="shrink-0" />
      <span>{message}</span>
    </div>
  )
}

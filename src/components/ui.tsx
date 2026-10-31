import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-felt-900/80 ring-1 ring-white/5 ${className}`}>{children}</div>
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 px-1 text-xs font-semibold tracking-wider text-felt-400 uppercase">{children}</h2>
}

export function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="text-white/40">±0</span>
  return (
    <span className={value > 0 ? 'text-felt-400' : 'text-rose-400'}>
      {value > 0 ? '+' : '−'}
      {Math.abs(value)}
    </span>
  )
}

export function Form({ form }: { form: boolean[] }) {
  return (
    <div className="flex gap-1" aria-label="Form der letzten Spiele">
      {form.map((won, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${won ? 'bg-felt-400' : 'bg-rose-400/80'}`}
          title={won ? 'Sieg' : 'Niederlage'}
        />
      ))}
    </div>
  )
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <Card className="px-6 py-10 text-center">
      <div className="mb-3 text-4xl">🎱</div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-white/60">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  const styles = {
    primary: 'bg-felt-500 text-white hover:bg-felt-400 disabled:bg-white/10 disabled:text-white/40',
    ghost: 'bg-white/5 text-white hover:bg-white/10',
    danger: 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-3 font-semibold transition active:scale-[0.98] ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-16 w-16 text-xl' }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-felt-600 font-bold text-felt-50 ${sizes[size]}`}
    >
      {initials(name)}
    </span>
  )
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

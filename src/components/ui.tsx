import { useState, type ReactNode } from 'react'
import { initials } from '../format.ts'

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

/** Two-step button instead of window.confirm, which some browsers block. */
export function ConfirmButton({
  children,
  confirmLabel,
  onConfirm,
  variant = 'danger',
  className = '',
}: {
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  className?: string
}) {
  const [armed, setArmed] = useState(false)
  if (!armed) {
    return (
      <Button variant={variant} className={className} onClick={() => setArmed(true)}>
        {children}
      </Button>
    )
  }
  return (
    <div className={`flex gap-2 ${className}`}>
      <Button variant="ghost" className="flex-1" onClick={() => setArmed(false)}>
        Abbrechen
      </Button>
      <Button
        variant="danger"
        className="flex-1"
        onClick={() => {
          setArmed(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </Button>
    </div>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-xl bg-white/5 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            value === o.value ? 'bg-felt-500 text-white shadow' : 'text-white/60 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  label: string
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/5">
      <button type="button" className="px-4 py-3 text-xl" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`${label} weniger`}>
        −
      </button>
      <span className="text-lg font-bold tabular-nums">{value}</span>
      <button type="button" className="px-4 py-3 text-xl" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`${label} mehr`}>
        +
      </button>
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{children}</p>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'good' }) {
  const tones = {
    neutral: 'bg-white/10 text-white/70',
    warn: 'bg-amber-300/15 text-amber-200',
    good: 'bg-felt-400/15 text-felt-400',
  }
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[tone]}`}>{children}</span>
}

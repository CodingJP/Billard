import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ArrowRightIcon, CheckIcon } from './icons.tsx'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-line bg-surface ${className}`}>{children}</div>
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`font-mono text-[10.5px] font-semibold tracking-[0.12em] text-muted uppercase ${className}`}>{children}</div>
}

/** Section heading inside a screen. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <Label className="mb-2 px-1">{children}</Label>
}

/** Big condensed headline used for screen titles and key numbers. */
export function Display({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`font-display leading-[0.9] font-extrabold uppercase ${className}`}>{children}</div>
}

export function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="font-mono text-[11px] font-semibold text-muted">±0</span>
  return (
    <span className={`font-mono text-[11px] font-semibold ${value > 0 ? 'text-good' : 'text-bad'}`}>
      {value > 0 ? '+' : '−'}
      {Math.abs(value)}
    </span>
  )
}

export function Form({ form }: { form: boolean[] }) {
  return (
    <span className="inline-flex gap-[3px]" aria-label="Form der letzten Spiele">
      {form.map((won, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${won ? 'bg-good' : 'bg-bad opacity-80'}`} />
      ))}
    </span>
  )
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <Card className="px-6 py-10 text-center">
      <div className="mx-auto mb-4 w-fit">
        <Ball id={8} size="lg" />
      </div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{text}</p>
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
  variant?: 'primary' | 'ghost' | 'danger' | 'accent'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  const styles = {
    primary: 'bg-strong text-strong-fg',
    accent: 'bg-accent text-accent-fg',
    ghost: 'border border-line bg-surface text-fg hover:bg-surface-2',
    danger: 'border border-line bg-surface text-bad hover:bg-surface-2',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 font-bold transition active:scale-[0.98] disabled:cursor-default disabled:opacity-35 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

/** Billiard ball colours 1–15; 9–15 are drawn striped. */
const BALL_COLORS = [
  '#f5b700', '#1d4ed8', '#d62839', '#6d28d9', '#f77f00', '#15803d', '#7f1d1d', '#111111',
  '#f5b700', '#1d4ed8', '#d62839', '#6d28d9', '#f77f00', '#15803d', '#7f1d1d',
]

function ballNumber(id: number): number {
  return ((id - 1) % 15 + 15) % 15 + 1
}

/** Every player gets a fixed ball (colour and number) derived from their user number. */
export function Ball({ id, size = 'md', ring = false }: { id: number; size?: 'sm' | 'md' | 'lg' | 'xl'; ring?: boolean }) {
  const n = ballNumber(id)
  const color = BALL_COLORS[n - 1]
  const striped = n > 8
  const sizes = { sm: 'h-8 w-8 text-[10px]', md: 'h-11 w-11 text-xs', lg: 'h-14 w-14 text-sm', xl: 'h-16 w-16 text-base' }
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${sizes[size]} ${
        ring ? 'ring-[3px] ring-accent ring-offset-2 ring-offset-bg' : ''
      }`}
      style={{
        background: striped ? `linear-gradient(#fafafa 0 22%, ${color} 22% 78%, #fafafa 78%)` : color,
        boxShadow: 'inset -3px -4px 8px rgba(0,0,0,.25), inset 3px 3px 6px rgba(255,255,255,.25)',
      }}
      aria-hidden="true"
    >
      <span className="flex h-[52%] w-[52%] items-center justify-center rounded-full bg-white font-bold text-[#111]">{n}</span>
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

/**
 * Slide-to-confirm control. Dragging the knob past 80% confirms; the knob
 * is also a regular button, so keyboard and screen reader users can activate it.
 */
export function SlideToConfirm({ label, doneLabel, onConfirm }: { label: string; doneLabel: string; onConfirm: () => void }) {
  const track = useRef<HTMLDivElement>(null)
  const start = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [offset, setOffset] = useState(0)
  const [done, setDone] = useState(false)

  const max = () => (track.current ? track.current.clientWidth - 56 : 200)
  const finish = () => {
    setDone(true)
    setOffset(max())
    onConfirm()
  }

  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (done) return
    start.current = e.clientX
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (start.current === null) return
    setOffset(Math.max(0, Math.min(max(), e.clientX - start.current)))
  }
  const up = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (start.current === null) return
    const moved = e.clientX - start.current
    start.current = null
    setDragging(false)
    if (moved > max() * 0.8) finish()
    else setOffset(0)
  }

  return (
    <div ref={track} className="relative h-14 touch-none overflow-hidden rounded-2xl bg-surface-2 select-none">
      <div
        className="absolute inset-y-0 left-0 rounded-2xl bg-good/25"
        style={{ width: offset + 56, transition: dragging ? 'none' : 'width .2s' }}
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-muted">
        {done ? doneLabel : label}
      </span>
      <button
        type="button"
        aria-label={label}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          start.current = null
          setDragging(false)
          setOffset(0)
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !done) {
            e.preventDefault()
            finish()
          }
        }}
        className="absolute top-1 left-1 flex h-12 w-12 cursor-grab items-center justify-center rounded-[13px] bg-good text-white"
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? 'none' : 'transform .2s' }}
      >
        {done ? <CheckIcon /> : <ArrowRightIcon />}
      </button>
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
    <div className="flex rounded-xl bg-surface-2 p-[3px]">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-[9px] px-3 py-2 text-sm font-semibold transition ${
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
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
  const btn = 'flex h-9 w-9 items-center justify-center rounded-[10px] border border-line bg-surface text-lg font-semibold disabled:opacity-30'
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label={`${label} weniger`}>
        −
      </button>
      <span className="min-w-6 text-center font-mono text-sm font-semibold tabular-nums">{value}</span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label={`${label} mehr`}>
        +
      </button>
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">{children}</p>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'good' }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    warn: 'bg-accent text-accent-fg',
    good: 'bg-good/15 text-good',
  }
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function BackLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="-ml-1 inline-flex items-center gap-1 self-start text-sm font-semibold text-muted hover:text-fg">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {children}
    </button>
  )
}

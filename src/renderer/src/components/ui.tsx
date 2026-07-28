import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'ghost' | 'danger'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // The `disabled:hover:` pairs are deliberate: CSS `:hover` still matches a
  // disabled button, so the plain hover colour has to be stacked out of the way
  // rather than left to variant ordering.
  primary:
    'bg-accent-600 text-white shadow-sm shadow-accent-600/25 hover:bg-accent-700 disabled:bg-mist-300 disabled:hover:bg-mist-300 disabled:text-ink-500 disabled:shadow-none',
  ghost:
    'bg-mist-200 text-ink-800 hover:bg-mist-300 disabled:hover:bg-mist-200 disabled:text-ink-500',
  danger: 'bg-transparent text-blush-700 hover:bg-blush-100 disabled:text-ink-500'
}

/** Shared focus treatment: a soft pastel halo instead of the platform ring. */
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-200'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'ghost', className = '', ...rest }: ButtonProps): ReactNode {
  return (
    <button
      {...rest}
      className={`no-drag inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed ${FOCUS_RING} ${BUTTON_VARIANTS[variant]} ${className}`}
    />
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-ink-500 uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}

const INPUT_BASE =
  'w-full rounded-md border border-mist-400 bg-mist-50 px-2.5 py-2 text-[13px] text-ink-900 outline-none transition-colors focus:border-accent-500 focus:ring-2 focus:ring-accent-100 disabled:bg-mist-200 disabled:text-ink-500'

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>): ReactNode {
  return <select {...rest} className={`${INPUT_BASE} ${className}`} />
}

export function TextInput({
  className = '',
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return <input {...rest} className={`${INPUT_BASE} placeholder:text-ink-500 ${className}`} />
}

export function Badge({
  children,
  className = '',
  pulse = false
}: {
  children: ReactNode
  className?: string
  pulse?: boolean
}): ReactNode {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      {pulse && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function EmptyState({
  title,
  hint,
  icon
}: {
  title: string
  hint?: string
  icon?: ReactNode
}): ReactNode {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      {icon && <div className="mb-1 text-accent-300">{icon}</div>}
      <p className="text-sm font-medium text-ink-800">{title}</p>
      {hint && <p className="max-w-xs text-[13px] leading-relaxed text-ink-500">{hint}</p>}
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }): ReactNode {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

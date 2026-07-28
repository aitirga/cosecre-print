import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'ghost' | 'danger'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent/85 disabled:bg-ink-700 disabled:text-ink-400',
  ghost: 'bg-ink-800 text-ink-200 hover:bg-ink-700 disabled:text-ink-400',
  danger: 'bg-transparent text-rose-300 hover:bg-rose-500/10 disabled:text-ink-400'
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'ghost', className = '', ...rest }: ButtonProps): ReactNode {
  return (
    <button
      {...rest}
      className={`no-drag inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`}
    />
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-ink-400 uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>): ReactNode {
  return (
    <select
      {...rest}
      className={`w-full rounded-md border border-ink-700 bg-ink-850 px-2.5 py-2 text-[13px] text-ink-100 outline-none focus:border-accent disabled:text-ink-400 ${className}`}
    />
  )
}

export function TextInput({
  className = '',
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return (
    <input
      {...rest}
      className={`w-full rounded-md border border-ink-700 bg-ink-850 px-2.5 py-2 text-[13px] text-ink-100 outline-none placeholder:text-ink-400 focus:border-accent ${className}`}
    />
  )
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
      {icon && <div className="mb-1 text-ink-600">{icon}</div>}
      <p className="text-sm font-medium text-ink-200">{title}</p>
      {hint && <p className="max-w-xs text-[13px] leading-relaxed text-ink-400">{hint}</p>}
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

import { useId, type ReactNode, type SVGProps } from 'react'

/**
 * The Cosecre-print mark, without the tile — for use on surfaces that already
 * have their own background (the title bar, dialogs).
 *
 * This is the React copy of `brand/mark.svg`; keep the two in sync. The
 * gradient ids are per-instance because two marks on the same page would
 * otherwise collide and the second would render with the first's fill.
 */
export function LogoMark(props: SVGProps<SVGSVGElement>): ReactNode {
  const id = useId()
  const paper = `${id}-paper`
  const blue = `${id}-blue`

  return (
    <svg viewBox="76 64 384 384" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id={paper} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f2f7fe" />
        </linearGradient>
        <linearGradient id={blue} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#7ea8ee" />
          <stop offset="1" stopColor="#2f5aa8" />
        </linearGradient>
      </defs>

      <path
        d="M 329.7 350.9 A 132 132 0 1 1 329.7 161.1"
        transform="translate(-8 0)"
        fill="none"
        stroke={`url(#${blue})`}
        strokeWidth="58"
      />
      <rect
        x="210"
        y="214"
        width="232"
        height="84"
        rx="19"
        fill={`url(#${paper})`}
        stroke="#2f5aa8"
        strokeWidth="13"
      />
      <g fill="#2f5aa8" opacity="0.5">
        <rect x="248" y="238" width="152" height="13" rx="6.5" />
        <rect x="248" y="262" width="100" height="13" rx="6.5" />
      </g>
    </svg>
  )
}

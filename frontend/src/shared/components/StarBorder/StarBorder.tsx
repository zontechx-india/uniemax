import type React from 'react'
import './StarBorder.css'

type StarBorderProps<T extends React.ElementType> = React.ComponentPropsWithoutRef<T> & {
  as?: T
  className?: string
  /** Classes for the inner content (the part inside the ring). */
  contentClassName?: string
  children?: React.ReactNode
  /** Colour of the travelling light. */
  color?: string
  /** Time for one full lap of the stroke. */
  speed?: React.CSSProperties['animationDuration']
  /** Stroke width in px. */
  thickness?: number
  /** Inline overrides; leave unset to style the content with `contentClassName`. */
  backgroundColor?: string
  textColor?: string
  borderColor?: string
}

/** A button (or any element via `as`) whose border has a light running round it continuously. */
const StarBorder = <T extends React.ElementType = 'button'>({
  as,
  className = '',
  contentClassName = '',
  color = 'white',
  speed = '6s',
  thickness = 1,
  backgroundColor,
  textColor,
  borderColor,
  children,
  style,
  ...rest
}: StarBorderProps<T>) => {
  const Component: React.ElementType = as || 'button'

  return (
    <Component
      className={`star-border-container ${className}`}
      {...rest}
      style={{ padding: `${thickness}px`, ...(style as React.CSSProperties | undefined) }}
    >
      <div
        aria-hidden
        className="star-border-spinner"
        style={{
          background: `conic-gradient(from 0deg, transparent 0deg, ${color} 30deg, transparent 60deg, transparent 180deg, ${color} 210deg, transparent 240deg)`,
          animationDuration: speed,
        }}
      />
      <div
        className={`star-border-content ${contentClassName}`}
        style={{ background: backgroundColor, color: textColor, borderColor }}
      >
        {children}
      </div>
    </Component>
  )
}

export default StarBorder

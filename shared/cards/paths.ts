// Path helpers shared by the SVG and PDF renderers. Kept free of dependencies
// so the preview does not pull pdf-lib into the page bundle.

/** Rounded rectangle as an SVG path, in mm, origin top-left. */
export function roundedRectPath(w: number, h: number, r: number): string {
  const k = Math.min(r, w / 2, h / 2)
  if (k <= 0) return `M0 0H${w}V${h}H0Z`
  return (
    `M${k} 0H${w - k}A${k} ${k} 0 0 1 ${w} ${k}V${h - k}A${k} ${k} 0 0 1 ${w - k} ${h}` +
    `H${k}A${k} ${k} 0 0 1 0 ${h - k}V${k}A${k} ${k} 0 0 1 ${k} 0Z`
  )
}

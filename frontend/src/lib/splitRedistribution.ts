// Dragging one participant's slider to `newValue` rescales every other participant's weight
// proportionally so the set always sums to 1.0, instead of leaving the total to drift.
export function redistributeSplit(
  weights: Record<string, string>,
  changedUserId: string,
  newValue: number
): Record<string, string> {
  const others = Object.keys(weights).filter(k => k !== changedUserId)
  const oldRemaining = others.reduce((s, k) => s + (parseFloat(weights[k]) || 0), 0)
  const newRemaining = Math.max(0, 1 - newValue)
  const next: Record<string, string> = { ...weights, [changedUserId]: String(newValue) }
  if (others.length === 0) return next
  if (oldRemaining > 0.0001) {
    const scale = newRemaining / oldRemaining
    others.forEach(k => { next[k] = String((parseFloat(weights[k]) || 0) * scale) })
  } else {
    const even = newRemaining / others.length
    others.forEach(k => { next[k] = String(even) })
  }
  // Correct floating-point drift so the set sums to exactly 1.0
  const total = Object.values(next).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const lastOther = others[others.length - 1]
  next[lastOther] = String((parseFloat(next[lastOther]) || 0) + (1 - total))
  return next
}

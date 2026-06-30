import { describe, it, expect } from 'vitest'
import { redistributeSplit } from '../splitRedistribution'

function approxEqual(a: number, b: number, eps = 1e-9) {
  expect(Math.abs(a - b)).toBeLessThan(eps)
}

describe('redistributeSplit', () => {
  it('rescales the other participant proportionally for two participants', () => {
    const result = redistributeSplit({ a: '0.5', b: '0.5' }, 'a', 0.8)
    expect(parseFloat(result.a)).toBe(0.8)
    approxEqual(parseFloat(result.b), 0.2)
  })

  it('keeps the total at exactly 1.0 across three participants', () => {
    const result = redistributeSplit({ a: '0.2', b: '0.3', c: '0.5' }, 'a', 0.6)
    const total = Object.values(result).reduce((s, v) => s + parseFloat(v), 0)
    approxEqual(total, 1)
    expect(parseFloat(result.a)).toBe(0.6)
  })

  it('preserves relative proportions of the untouched participants', () => {
    const result = redistributeSplit({ a: '0.2', b: '0.2', c: '0.6' }, 'a', 0.5)
    // b and c were equal/triple before; remaining 0.5 should split 0.125/0.375
    approxEqual(parseFloat(result.b), 0.125)
    approxEqual(parseFloat(result.c), 0.375)
  })

  it('returns unchanged weights when there are no other participants', () => {
    const result = redistributeSplit({ a: '1' }, 'a', 0.4)
    expect(result).toEqual({ a: '0.4' })
  })

  it('splits the remaining weight evenly when other weights were all zero', () => {
    const result = redistributeSplit({ a: '1', b: '0', c: '0' }, 'a', 0.4)
    approxEqual(parseFloat(result.b), 0.3)
    approxEqual(parseFloat(result.c), 0.3)
  })

  it('drives others negative via drift correction when the changed value exceeds 1.0', () => {
    // Not ideal UX (sliders are clamped to [0,100] in the UI so this never happens
    // through normal interaction), but this pins the function's actual behavior:
    // the rescale floors at zero, then the sum-to-1.0 drift correction pushes the
    // single remaining "other" negative to compensate for the overflow.
    const result = redistributeSplit({ a: '0.5', b: '0.5' }, 'a', 1.2)
    expect(parseFloat(result.a)).toBe(1.2)
    approxEqual(parseFloat(result.b), -0.2)
    const total = Object.values(result).reduce((s, v) => s + parseFloat(v), 0)
    approxEqual(total, 1)
  })

  it('treats unparsable existing weights as zero', () => {
    const result = redistributeSplit({ a: 'not-a-number', b: '1' }, 'b', 0.5)
    const total = Object.values(result).reduce((s, v) => s + (parseFloat(v) || 0), 0)
    approxEqual(total, 1)
  })

  it('treats an unparsable other weight as zero during proportional rescale, not just the even-split path', () => {
    // b is valid so oldRemaining > 0.0001 (the proportional-scale branch runs), but c is
    // unparsable — this exercises the `|| 0` fallback inside that branch's forEach, not the
    // all-zero fallback covered by the previous test.
    const result = redistributeSplit({ changed: '0.2', b: '0.5', c: 'bad' }, 'changed', 0.3)
    expect(parseFloat(result.changed)).toBe(0.3)
    approxEqual(parseFloat(result.c), 0)
    const total = Object.values(result).reduce((s, v) => s + (parseFloat(v) || 0), 0)
    approxEqual(total, 1)
  })
})

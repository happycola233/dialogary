import { describe, expect, it } from 'vitest'
import { resolveLegacyHeightAdjustment } from './lazyRendering'

describe('legacy scroll stability fallback', () => {
  it('compensates growth and shrinkage that happened fully above the viewport', () => {
    expect(resolveLegacyHeightAdjustment(100, 260, 900, 1000, false)).toBe(160)
    expect(resolveLegacyHeightAdjustment(260, 100, 900, 1000, false)).toBe(-160)
  })

  it('does not move the page for visible content or while navigation owns scrollTop', () => {
    expect(resolveLegacyHeightAdjustment(100, 260, 1100, 1000, false)).toBe(0)
    expect(resolveLegacyHeightAdjustment(100, 260, 900, 1000, true)).toBe(0)
  })

  it('ignores subpixel observer noise', () => {
    expect(resolveLegacyHeightAdjustment(100, 100.25, 900, 1000, false)).toBe(0)
  })
})

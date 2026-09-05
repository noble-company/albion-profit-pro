import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import { usePageVisible } from './usePageVisible'

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    configurable: true,
  })
})

test('reflete o estado atual e reage a visibilitychange', () => {
  const { result } = renderHook(() => usePageVisible())
  expect(result.current).toBe(true)

  setVisibility('hidden')
  expect(result.current).toBe(false)

  setVisibility('visible')
  expect(result.current).toBe(true)
})

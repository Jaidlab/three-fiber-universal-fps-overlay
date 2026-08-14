import {expect, test} from 'bun:test'

const {default: threeFiberUniversalFpsOverlay} = await import('#src/main.ts')

test('should run', () => {
  const result = threeFiberUniversalFpsOverlay()
  expect(result).toBe('three-fiber-universal-fps-overlay') // TODO Test actual functionality
})

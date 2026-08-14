import {expect, test} from 'bun:test'

import RollingFrameCounter from '#src/rollingFrameCounter.ts'

test('counts frames inside the rolling window', () => {
  const counter = new RollingFrameCounter(1000)
  counter.record(0)
  counter.record(100)
  counter.record(999)
  expect(counter.count(999)).toBe(3)
  expect(counter.count(1001)).toBe(2)
  expect(counter.count(2000)).toBe(0)
})
test('counts demand-rendered frames instead of display refreshes', () => {
  const counter = new RollingFrameCounter(1000)
  counter.record(5000)
  expect(counter.count(5000)).toBe(1)
  expect(counter.count(6001)).toBe(0)
})

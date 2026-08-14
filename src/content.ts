import RollingFrameCounter from './rollingFrameCounter.ts'

const PATCHED = Symbol.for('three-fiber-universal-fps-overlay.patched.v1')
const WEBGPU_PATCHED = Symbol.for('three-fiber-universal-fps-overlay.webgpu-patched.v1')
const WINDOW_MS = 1000
const nativeRequestAnimationFrame = globalThis.requestAnimationFrame.bind(globalThis)
const nativePerformanceNow = globalThis.performance.now.bind(globalThis.performance)
const nativeReflectApply = Reflect.apply
const nativeDefineProperty = Object.defineProperty
const nativeGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
interface OverlayState {
  canvas: HTMLCanvasElement
  counter: RollingFrameCounter
  host: HTMLDivElement
  label: HTMLDivElement
  lastDisplayedFps: number
}

type Callable = (this: unknown, ...args: Array<unknown>) => unknown

const states = new Map<HTMLCanvasElement, OverlayState>
const lastMarkedAnimationFrame = new WeakMap<HTMLCanvasElement, number>
const webgpuCanvasByContext = new WeakMap<object, HTMLCanvasElement>
let animationFrameSerial = 0
let tickerStarted = false
function importantStyle(element: HTMLElement, property: string, value: string) {
  element.style.setProperty(property, value, 'important')
}
function makeOverlay() {
  const host = document.createElement('div')
  importantStyle(host, 'all', 'initial')
  importantStyle(host, 'display', 'block')
  importantStyle(host, 'position', 'fixed')
  importantStyle(host, 'left', '0')
  importantStyle(host, 'top', '0')
  importantStyle(host, 'width', 'max-content')
  importantStyle(host, 'height', 'auto')
  importantStyle(host, 'margin', '0')
  importantStyle(host, 'padding', '0')
  importantStyle(host, 'border', '0')
  importantStyle(host, 'pointer-events', 'none')
  importantStyle(host, 'z-index', '2147483647')
  importantStyle(host, 'contain', 'layout style paint')
  importantStyle(host, 'will-change', 'transform')
  const shadow = host.attachShadow({mode: 'closed'})
  const label = document.createElement('div')
  label.textContent = '0 FPS'
  label.style.cssText = [
    'all: initial !important',
    'display: block !important',
    'box-sizing: border-box !important',
    'padding: 3px 6px !important',
    'border-radius: 0 0 4px 0 !important',
    'background: rgba(0, 0, 0, 0.72) !important',
    'color: #fff !important',
    'font: 600 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important',
    'font-variant-numeric: tabular-nums !important',
    'white-space: nowrap !important',
    'text-shadow: none !important',
    'box-shadow: none !important',
    'pointer-events: none !important',
    'user-select: none !important',
  ].join(';')
  shadow.append(label)
  return {
    host,
    label,
  }
}
function stateFor(canvas: HTMLCanvasElement) {
  const existing = states.get(canvas)
  if (existing) {
    return existing
  }
  const {host, label} = makeOverlay()
  const state: OverlayState = {
    canvas,
    counter: new RollingFrameCounter(WINDOW_MS),
    host,
    label,
    lastDisplayedFps: -1,
  }
  states.set(canvas, state)
  return state
}
function ensureHostAttached(state: OverlayState) {
  if (state.host.isConnected) {
    return
  }
  const root = document.documentElement as HTMLElement | null
  if (root) {
    root.append(state.host)
  }
}
function updateOverlay(state: OverlayState, timestamp: number) {
  const {canvas, host, label} = state
  if (!canvas.isConnected) {
    host.remove()
    states.delete(canvas)
    return
  }
  ensureHostAttached(state)
  const fps = state.counter.count(timestamp)
  if (fps !== state.lastDisplayedFps) {
    label.textContent = `${fps} FPS`
    state.lastDisplayedFps = fps
  }
  const rect = canvas.getBoundingClientRect()
  const visible = rect.width > 0
    && rect.height > 0
    && rect.bottom > 0
    && rect.right > 0
    && rect.top < window.innerHeight
    && rect.left < window.innerWidth
  if (!visible) {
    importantStyle(host, 'display', 'none')
    return
  }
  importantStyle(host, 'display', 'block')
  importantStyle(host, 'transform', `translate3d(${Math.round(rect.left)}px, ${Math.round(rect.top)}px, 0)`)
}
function tick(timestamp: number) {
  animationFrameSerial += 1
  for (const state of states.values()) {
    updateOverlay(state, timestamp)
  }
  nativeRequestAnimationFrame(tick)
}
function ensureTicker() {
  if (tickerStarted) {
    return
  }
  tickerStarted = true
  nativeRequestAnimationFrame(tick)
}
function markCanvasRender(canvas: HTMLCanvasElement) {
  ensureTicker()
  if (lastMarkedAnimationFrame.get(canvas) === animationFrameSerial) {
    return
  }
  lastMarkedAnimationFrame.set(canvas, animationFrameSerial)
  stateFor(canvas).counter.record(nativePerformanceNow())
}
function markWebGLRender(context: unknown) {
  if (typeof context !== 'object' || context === null) {
    return
  }
  const canvas = (context as {canvas?: unknown}).canvas
  if (canvas instanceof HTMLCanvasElement) {
    markCanvasRender(canvas)
  }
}
function isPatched(callable: Callable, symbol = PATCHED) {
  return Reflect.get(callable, symbol) === true
}
function markPatched(callable: Callable, symbol = PATCHED) {
  nativeDefineProperty(callable, symbol, {value: true})
}
function replaceMethod(target: object, name: string, replacement: Callable) {
  const descriptor = nativeGetOwnPropertyDescriptor(target, name)
  try {
    nativeDefineProperty(target, name, descriptor ? {
      ...descriptor,
      value: replacement,
    } : {
      configurable: true,
      writable: true,
      value: replacement,
    })
    return true
  } catch {
    return false
  }
}
function wrapWebGLMethod(prototype: object, name: string) {
  const original: unknown = Reflect.get(prototype, name)
  if (typeof original !== 'function') {
    return
  }
  const callable = original as Callable
  if (isPatched(callable)) {
    return
  }
  function wrapped(this: unknown, ...args: Array<unknown>) {
    const result = nativeReflectApply(callable, this, args)
    markWebGLRender(this)
    return result
  }
  markPatched(wrapped)
  replaceMethod(prototype, name, wrapped)
}
function wrapExtensionMethod(extension: unknown, name: string, webglContext: unknown) {
  if (typeof extension !== 'object' || extension === null) {
    return
  }
  const original: unknown = Reflect.get(extension, name)
  if (typeof original !== 'function') {
    return
  }
  const callable = original as Callable
  if (isPatched(callable)) {
    return
  }
  function wrapped(this: unknown, ...args: Array<unknown>) {
    const result = nativeReflectApply(callable, this, args)
    markWebGLRender(webglContext)
    return result
  }
  markPatched(wrapped)
  replaceMethod(extension, name, wrapped)
}
function wrapGetExtension(prototype: object) {
  const original: unknown = Reflect.get(prototype, 'getExtension')
  if (typeof original !== 'function') {
    return
  }
  const callable = original as Callable
  if (isPatched(callable)) {
    return
  }
  function wrapped(this: unknown, ...args: Array<unknown>) {
    const extension = nativeReflectApply(callable, this, args)
    const requestedName = args[0]
    if (typeof requestedName !== 'string') {
      return extension
    }
    const normalized = requestedName.toUpperCase()
    if (normalized === 'ANGLE_INSTANCED_ARRAYS') {
      wrapExtensionMethod(extension, 'drawArraysInstancedANGLE', this)
      wrapExtensionMethod(extension, 'drawElementsInstancedANGLE', this)
    } else if (normalized === 'WEBGL_MULTI_DRAW') {
      wrapExtensionMethod(extension, 'multiDrawArraysWEBGL', this)
      wrapExtensionMethod(extension, 'multiDrawElementsWEBGL', this)
      wrapExtensionMethod(extension, 'multiDrawArraysInstancedWEBGL', this)
      wrapExtensionMethod(extension, 'multiDrawElementsInstancedWEBGL', this)
    }
    return extension
  }
  markPatched(wrapped)
  replaceMethod(prototype, 'getExtension', wrapped)
}
function patchWebGPUContext(context: unknown, canvas: HTMLCanvasElement) {
  if (typeof context !== 'object' || context === null) {
    return
  }
  webgpuCanvasByContext.set(context, canvas)
  const prototype = Object.getPrototypeOf(context) as object | null
  if (!prototype) {
    return
  }
  const original: unknown = Reflect.get(prototype, 'getCurrentTexture')
  if (typeof original !== 'function') {
    return
  }
  const callable = original as Callable
  if (isPatched(callable, WEBGPU_PATCHED)) {
    return
  }
  function wrapped(this: unknown, ...args: Array<unknown>) {
    const texture = nativeReflectApply(callable, this, args)
    if (typeof this === 'object' && this !== null) {
      const owner = webgpuCanvasByContext.get(this)
      if (owner) {
        markCanvasRender(owner)
      }
    }
    return texture
  }
  markPatched(wrapped, WEBGPU_PATCHED)
  replaceMethod(prototype, 'getCurrentTexture', wrapped)
}
function wrapCanvasGetContext() {
  const prototype = HTMLCanvasElement.prototype
  const original: unknown = Reflect.get(prototype, 'getContext')
  if (typeof original !== 'function') {
    return
  }
  const callable = original as Callable
  if (isPatched(callable)) {
    return
  }
  function wrapped(this: unknown, ...args: Array<unknown>) {
    const context = nativeReflectApply(callable, this, args)
    const requestedType = args[0]
    if (this instanceof HTMLCanvasElement && typeof requestedType === 'string') {
      const normalized = requestedType.toLowerCase()
      if (normalized === 'webgl' || normalized === 'webgl2' || normalized === 'experimental-webgl') {
        ensureTicker()
      } else if (normalized === 'webgpu') {
        ensureTicker()
        patchWebGPUContext(context, this)
      }
    }
    return context
  }
  markPatched(wrapped)
  replaceMethod(prototype, 'getContext', wrapped)
}
const webgl1Methods = [
  'clear',
  'drawArrays',
  'drawElements',
]
const webgl2Methods = [
  'clear',
  'drawArrays',
  'drawElements',
  'drawArraysInstanced',
  'drawElementsInstanced',
  'drawRangeElements',
  'clearBufferfv',
  'clearBufferiv',
  'clearBufferuiv',
  'clearBufferfi',
  'blitFramebuffer',
]
wrapCanvasGetContext()
if (typeof WebGLRenderingContext !== 'undefined') {
  for (const name of webgl1Methods) {
    wrapWebGLMethod(WebGLRenderingContext.prototype, name)
  }
  wrapGetExtension(WebGLRenderingContext.prototype)
}
if (typeof WebGL2RenderingContext !== 'undefined') {
  for (const name of webgl2Methods) {
    wrapWebGLMethod(WebGL2RenderingContext.prototype, name)
  }
  wrapGetExtension(WebGL2RenderingContext.prototype)
}

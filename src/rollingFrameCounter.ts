export default class RollingFrameCounter {
  #head = 0
  #samples: Array<number> = []
  readonly #windowMs: number

  constructor(windowMs = 1000) {
    this.#windowMs = windowMs
  }

  count(timestamp: number) {
    this.#prune(timestamp)
    return this.#samples.length - this.#head
  }

  record(timestamp: number) {
    this.#samples.push(timestamp)
  }

  #prune(timestamp: number) {
    const cutoff = timestamp - this.#windowMs
    while (this.#head < this.#samples.length && this.#samples[this.#head] < cutoff) {
      this.#head += 1
    }
    if (this.#head > 256 && this.#head > this.#samples.length / 2) {
      this.#samples = this.#samples.slice(this.#head)
      this.#head = 0
    }
  }
}

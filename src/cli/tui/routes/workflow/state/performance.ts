/**
 * O(1) circular buffer using head/tail pointers
 * Avoids O(n) shift() operations on each push
 */
export class CircularBuffer<T> {
  private buffer: (T | undefined)[]
  private head = 0
  private tail = 0
  private count = 0
  private maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
    this.buffer = new Array(maxSize)
  }

  push(item: T): void {
    this.buffer[this.tail] = item
    this.tail = (this.tail + 1) % this.maxSize

    if (this.count < this.maxSize) {
      this.count++
    } else {
      // Buffer is full, advance head (overwrite oldest)
      this.head = (this.head + 1) % this.maxSize
    }
  }

  getAll(): T[] {
    const result: T[] = []
    for (let i = 0; i < this.count; i++) {
      const index = (this.head + i) % this.maxSize
      result.push(this.buffer[index] as T)
    }
    return result
  }

  getSlice(start: number, end?: number): T[] {
    const all = this.getAll()
    return all.slice(start, end)
  }

  clear(): void {
    this.buffer = new Array(this.maxSize)
    this.head = 0
    this.tail = 0
    this.count = 0
  }

  get length(): number {
    return this.count
  }
}

export function getVisibleItems<T>(
  items: T[],
  scrollOffset: number,
  viewportHeight: number
): { visibleItems: T[]; startIndex: number; endIndex: number } {
  const startIndex = Math.max(0, scrollOffset)
  const endIndex = Math.min(items.length, startIndex + viewportHeight)

  return {
    visibleItems: items.slice(startIndex, endIndex),
    startIndex,
    endIndex,
  }
}

type WcdbGateMode = 'read' | 'write'

type WcdbGateRelease = () => void

interface WcdbGateWaiter {
  mode: WcdbGateMode
  resolve: (release: WcdbGateRelease) => void
}

class WcdbAccessGate {
  private activeReaders = 0
  private activeWriter = false
  private readonly queue: WcdbGateWaiter[] = []

  async acquireRead(): Promise<WcdbGateRelease> {
    if (!this.activeWriter && this.queue.length === 0) {
      this.activeReaders += 1
      return this.createReadRelease()
    }

    return await new Promise<WcdbGateRelease>((resolve) => {
      this.queue.push({ mode: 'read', resolve })
      this.drain()
    })
  }

  async acquireWrite(): Promise<WcdbGateRelease> {
    if (!this.activeWriter && this.activeReaders === 0 && this.queue.length === 0) {
      this.activeWriter = true
      return this.createWriteRelease()
    }

    return await new Promise<WcdbGateRelease>((resolve) => {
      this.queue.push({ mode: 'write', resolve })
      this.drain()
    })
  }

  private createReadRelease(): WcdbGateRelease {
    let released = false
    return () => {
      if (released) return
      released = true
      this.activeReaders = Math.max(0, this.activeReaders - 1)
      this.drain()
    }
  }

  private createWriteRelease(): WcdbGateRelease {
    let released = false
    return () => {
      if (released) return
      released = true
      this.activeWriter = false
      this.drain()
    }
  }

  private drain(): void {
    if (this.activeWriter) return
    if (this.activeReaders > 0) return
    if (this.queue.length === 0) return

    const head = this.queue[0]
    if (head.mode === 'write') {
      this.queue.shift()
      this.activeWriter = true
      head.resolve(this.createWriteRelease())
      return
    }

    const readers: WcdbGateWaiter[] = []
    while (this.queue.length > 0 && this.queue[0].mode === 'read') {
      readers.push(this.queue.shift()!)
    }
    if (readers.length === 0) return

    this.activeReaders += readers.length
    for (const waiter of readers) {
      waiter.resolve(this.createReadRelease())
    }
  }
}

export const wcdbAccessGate = new WcdbAccessGate()

import type { Dare } from './types.js';

export class DareQueue {
  private pending: Dare[] = [];
  private active = false;

  push(dare: Dare): void {
    this.pending.push(dare);
    this.pending.sort((a, b) => b.bountyBits - a.bountyBits || a.createdAt - b.createdAt);
  }

  next(): Dare | undefined {
    if (this.active) return undefined;
    const dare = this.pending.shift();
    this.active = dare !== undefined;
    return dare;
  }

  finish(): void {
    if (!this.active) throw new Error('No active dare to finish');
    this.active = false;
  }

  get size(): number {
    return this.pending.length;
  }
}

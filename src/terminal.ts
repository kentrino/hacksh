export type TerminalOwner = "prompt" | "exec";

export class TerminalLock {
  #owner: TerminalOwner | undefined;

  get owner(): TerminalOwner | undefined {
    return this.#owner;
  }

  acquire(owner: TerminalOwner): boolean {
    if (this.#owner !== undefined) return false;
    this.#owner = owner;
    return true;
  }

  release(): void {
    this.#owner = undefined;
  }
}

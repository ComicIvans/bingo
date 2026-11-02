// One process owns the data folder, so a promise chain is enough to run every
// mutation (game, sets, settings, logo, batches) one at a time.

let tail: Promise<unknown> = Promise.resolve()

/** Runs `task` once every task queued before it has settled. */
export function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task)
  // A failed task must not block the ones queued after it.
  tail = run.catch(() => undefined)
  return run
}

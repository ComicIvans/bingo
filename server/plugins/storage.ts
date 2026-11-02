import { isAbsolute, resolve } from 'node:path'
import fsDriver from 'unstorage/drivers/fs'

// Everything the app keeps (current game, history, sets, batches, logo) lives
// in this mount, so it survives restarts. Mounted synchronously: Nitro does
// not wait for async plugins before serving requests.
export default defineNitroPlugin(() => {
  const { dataDir } = useRuntimeConfig()
  const base = isAbsolute(dataDir) ? dataDir : resolve(process.cwd(), dataDir)
  useStorage().mount('bingo', fsDriver({ base }))
})

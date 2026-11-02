// Module worker that builds the cards PDF off the main thread. It gets no
// Nuxt auto-imports: everything is imported explicitly.

import { runPdfJob } from './pdf-job'
import type { PdfJobRequest, PdfWorkerMessage } from './pdf-protocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope

function send(message: PdfWorkerMessage, transfer: Transferable[] = []) {
  ctx.postMessage(message, transfer)
}

ctx.addEventListener('message', async (event: MessageEvent<PdfJobRequest>) => {
  try {
    let lastPost = 0
    const pdf = await runPdfJob(event.data, (phase, done, total) => {
      // Throttle progress messages; always send the last one.
      const now = performance.now()
      if (done < total && now - lastPost < 50) return
      lastPost = now
      send({ type: 'progress', phase, done, total })
    })
    send({ type: 'done', pdf }, [pdf.buffer as ArrayBuffer])
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : String(error)
    send({ type: 'error', message })
  }
})

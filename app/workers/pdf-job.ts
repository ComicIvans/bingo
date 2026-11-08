// The PDF job itself, free of worker plumbing so it can also run in Node.

import fontkit from '@pdf-lib/fontkit'
import type { Font } from '@pdf-lib/fontkit'
import { cardCode, generateBatch } from '#shared/cards/grid'
import { renderPdf } from '#shared/cards/pdf'
import { TextEngine } from '#shared/cards/text'
import { fallbackChain } from '../utils/generator/fonts'
import type { PdfJobPhase, PdfJobRequest } from './pdf-protocol'

export async function runPdfJob(
  job: PdfJobRequest,
  onProgress: (phase: PdfJobPhase, done: number, total: number) => void
): Promise<Uint8Array> {
  const fontBytes = new Map<string, Uint8Array>()
  const fonts = new Map<string, Font>()
  for (const [id, buffer] of job.fonts) {
    const bytes = new Uint8Array(buffer)
    fontBytes.set(id, bytes)
    fonts.set(id, fontkit.create(bytes))
  }
  const engine = new TextEngine(fonts, fallbackChain)

  onProgress('cards', 0, job.count)
  const cards = generateBatch({
    engine: job.engine,
    seed: job.seed,
    spec: job.spec,
    indices: job.indices,
    count: job.count,
    firstNumber: job.firstNumber,
  })
  const codes = cards.map((card) => cardCode(job.batchId, card.number, job.lastNumber))
  onProgress('cards', job.count, job.count)

  return renderPdf(
    {
      design: job.design,
      spec: job.spec,
      cards,
      codes,
      labels: job.labels,
      sheet: job.sheet,
      title: job.title,
    },
    { fonts: fontBytes, images: new Map(job.images) },
    engine,
    {
      // Full embedding on purpose: the subsetter breaks composite glyphs.
      subset: false,
      onProgress: (done, total) => onProgress('pages', done, total),
    }
  )
}

import { readFile } from 'fs/promises'
import { rankCandidateSummaries, summarizeCandidate } from '../core/evaluate'
import type { HighlightCandidate } from '../types/score'

const args = process.argv.slice(2)

if (args.length === 0) {
  throw new Error(
    'Usage: bun src/cli/evaluate-highlight.ts configA=./a.json configB=./b.json'
  )
}

const summaries = await Promise.all(
  args.map(async (arg) => {
    const [config, filePath] = arg.split('=')
    if (!config || !filePath) {
      throw new Error(`Invalid argument: ${arg}`)
    }

    const candidate = JSON.parse(
      await readFile(filePath, 'utf8')
    ) as HighlightCandidate
    return summarizeCandidate(candidate, config)
  })
)

console.log(JSON.stringify(rankCandidateSummaries(summaries), null, 2))

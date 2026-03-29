import type { HighlightCandidate } from '../types/score'

export interface CandidateEvaluationSummary {
  averageScore: number
  config: string
  segmentCount: number
  topScore: number
}

export function summarizeCandidate(
  candidate: HighlightCandidate,
  config: string
): CandidateEvaluationSummary {
  const scores = candidate.segments.map((segment) => segment.score)
  const averageScore =
    scores.length === 0
      ? 0
      : scores.reduce((sum, score) => sum + score, 0) / scores.length

  return {
    averageScore,
    config,
    segmentCount: candidate.segments.length,
    topScore: scores.length === 0 ? 0 : Math.max(...scores),
  }
}

export function rankCandidateSummaries(
  summaries: CandidateEvaluationSummary[]
): CandidateEvaluationSummary[] {
  return [...summaries].sort((a, b) => {
    if (b.averageScore !== a.averageScore)
      return b.averageScore - a.averageScore
    if (b.topScore !== a.topScore) return b.topScore - a.topScore
    return b.segmentCount - a.segmentCount
  })
}

import type { LearningMode } from './course'
import type { Metric, Observation } from './experiment'

export type TutorAction =
  | 'explain'
  | 'ask-question'
  | 'analyze-answer'
  | 'give-hint'
  | 'generate-experiment'
  | 'analyze-experiment'
  | 'recommend-next-concept'
export interface TutorContext {
  courseId: string
  conceptIds: string[]
  experimentId: string
  mode: LearningMode
  metrics: Metric[]
  observations: Observation[]
}
export interface TutorRequest {
  action: TutorAction
  context: TutorContext
  question?: string
}
export interface TutorResponse {
  available: boolean
  message: string
}
export interface TutorProvider {
  id: string
  available: boolean
  ask(request: TutorRequest): Promise<TutorResponse>
}

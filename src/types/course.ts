import type { ExperimentDefinition } from './experiment'

export type LearningMode = 'learn' | 'experiment' | 'challenge'
export interface Concept {
  id: string
  title: string
  content: string
  why: string
  relatedConcepts: string[]
}
export interface Challenge {
  question: string
  options: { id: string; text: string }[]
  answer: string
  explanation: string
  hint: string
}
export interface Course {
  id: string
  title: string
  englishTitle: string
  slug: string
  level: number
  category: string
  duration: number
  description: string
  question: string
  objectives: string[]
  prerequisites: string[]
  nextConcepts: string[]
  concepts: Concept[]
  experiments: ExperimentDefinition[]
  content: string
  challenge: Challenge
}
export interface ConceptReference {
  id: string
  title: string
  level: number
  courseId?: string
}

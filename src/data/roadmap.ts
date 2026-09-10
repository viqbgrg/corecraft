import data from './roadmap.json'

export interface RoadmapLevel {
  level: number
  title: string
  summary: string
  groups: { title: string; topics: string[] }[]
  experiments: string[]
}

export const roadmap: RoadmapLevel[] = data

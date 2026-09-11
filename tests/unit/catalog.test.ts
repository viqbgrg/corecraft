import { describe, expect, it } from 'vitest'
import { courses, getCourse } from '../../src/courses'
import { conceptReference } from '../../src/data/concepts'
import { roadmap } from '../../src/data/roadmap'
import { topicCoverage } from '../../src/data/coverage'
import { createExperiment } from '../../src/experiments/registry'

describe('course and engine integration', () => {
  it('has working lessons and eighteen roadmap levels', () => {
    expect(courses).toHaveLength(81)
    expect(roadmap.map((l) => l.level)).toEqual(Array.from({ length: 18 }, (_, i) => i))
    expect(new Set(courses.map((c) => c.id)).size).toBe(courses.length)
  })
  it('isolates sessions and resets without leaking prior state', () => {
    const definition = getCourse('binary')!.experiments[0]!
    const first = createExperiment(definition)
    const second = createExperiment(definition)
    const initial = second.view()
    first.dispatch({ type: 'overflow' })
    expect(second.view()).toEqual(initial)
    first.reset()
    expect(first.view()).toEqual(initial)
  })
  it('links only existing roadmap topics to real courses and covers every topic in Levels 0–17', () => {
    const keys = new Set<string>()
    for (const entry of topicCoverage) {
      const level = roadmap.find((l) => l.level === entry.level)!
      const course = courses.find((c) => c.slug === entry.course)!
      expect(course.level).toBe(entry.level)
      for (const topic of entry.topics) {
        expect(level.groups.flatMap((g) => g.topics)).toContain(topic)
        const key = `${entry.level}:${topic}`
        expect(keys.has(key)).toBe(false)
        keys.add(key)
      }
    }
    for (const level of roadmap.filter((l) => l.level <= 17))
      for (const topic of level.groups.flatMap((g) => g.topics))
        expect(keys.has(`${level.level}:${topic}`), `${level.level}:${topic}`).toBe(true)
  })
  it('applies CPU configuration and rejects unsupported fixed model dimensions', () => {
    const definition = getCourse('cpu')!.experiments[0]!
    const session = createExperiment({ ...definition, config: { a: 5, b: 7 } })
    for (let i = 0; i < 6; i++) session.dispatch({ type: 'instruction' })
    expect(session.view().metrics.find((m) => m.label === 'R1')?.value).toBe(12)
    expect(() =>
      createExperiment({ ...getCourse('binary')!.experiments[0]!, config: { width: 16 } }),
    ).toThrow('width: 8')
  })
  it.each(courses)('$slug resolves its engine, Markdown, challenge and knowledge links', (course) => {
    const definition = course.experiments[0]!
    const session = createExperiment(definition)
    expect(session.view().controls.length).toBeGreaterThan(0)
    expect(session.view().goal.reached).toBe(false)
    for (const phase of ['Problem', 'Why', 'Mechanism', 'Experiment', 'Conclusion'])
      expect(course.content).toContain('## ' + phase)
    expect(course.challenge.options.some((o) => o.id === course.challenge.answer)).toBe(true)
    for (const id of [
      ...course.prerequisites,
      ...course.nextConcepts,
      ...course.concepts.flatMap((c) => c.relatedConcepts),
    ]) {
      const ref = conceptReference(id)
      expect(ref.title).not.toBe(id)
      if (ref.courseId) expect(courses.some((c) => c.slug === ref.courseId)).toBe(true)
    }
  })
})

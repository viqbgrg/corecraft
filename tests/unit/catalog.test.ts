import { describe, expect, it } from 'vitest'
import { courses } from '../../src/courses'
import { conceptReference } from '../../src/data/concepts'
import { roadmap } from '../../src/data/roadmap'
import { createExperiment } from '../../src/experiments/registry'

describe('course and engine integration', () => {
  it('has exactly ten working lessons and eighteen roadmap levels', () => {
    expect(courses).toHaveLength(10)
    expect(roadmap.map((l) => l.level)).toEqual(Array.from({ length: 18 }, (_, i) => i))
    expect(new Set(courses.map((c) => c.id)).size).toBe(10)
  })
  it('isolates sessions and resets without leaking prior state', () => {
    const definition = courses[0]!.experiments[0]!
    const first = createExperiment(definition)
    const second = createExperiment(definition)
    const initial = second.view()
    first.dispatch({ type: 'overflow' })
    expect(second.view()).toEqual(initial)
    first.reset()
    expect(first.view()).toEqual(initial)
  })
  it('applies CPU configuration and rejects unsupported fixed model dimensions', () => {
    const definition = courses[1]!.experiments[0]!
    const session = createExperiment({ ...definition, config: { a: 5, b: 7 } })
    for (let i = 0; i < 6; i++) session.dispatch({ type: 'instruction' })
    expect(session.view().metrics.find((m) => m.label === 'R1')?.value).toBe(12)
    expect(() => createExperiment({ ...courses[0]!.experiments[0]!, config: { width: 16 } })).toThrow(
      'width: 8',
    )
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

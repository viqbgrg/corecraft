import type { Course } from '../types/course'
import binary from './binary'
import cpu from './cpu'
import cache from './cache'

export const courses: Course[] = [binary, cpu, cache]
export const getCourse = (slug: string): Course | undefined => courses.find(course => course.slug === slug)

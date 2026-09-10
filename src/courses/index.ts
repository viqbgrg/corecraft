import type { Course } from '../types/course'
import binary from './binary'
import cpu from './cpu'
import cache from './cache'
import process from './process'
import virtualMemory from './virtual-memory'
import handshake from './tcp-handshake'
import close from './tcp-close'
import dns from './dns'
import http from './http'
import btree from './btree'

export const courses: Course[] = [
  binary,
  cpu,
  cache,
  process,
  virtualMemory,
  handshake,
  close,
  dns,
  http,
  btree,
]
export const getCourse = (slug: string): Course | undefined => courses.find((course) => course.slug === slug)

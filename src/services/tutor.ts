import type { TutorProvider } from '../types/tutor'

/** Replace this adapter when a secure API architecture is available. No requests are sent. */
export const tutorProvider: TutorProvider = {
  id: 'coming-soon',
  available: false,
  async ask() {
    return { available: false, message: 'AI Tutor coming soon. 未来的老师将结合课程、操作记录与实验状态，陪你一起推理。' }
  },
}

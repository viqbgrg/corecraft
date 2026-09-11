import { createRouter, createWebHashHistory } from 'vue-router'
import { getCourse } from '../courses'

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/learn/modeling' },
    { path: '/learn/:slug', component: () => import('../views/LessonView.vue') },
    { path: '/roadmap', component: () => import('../views/RoadmapView.vue') },
    { path: '/:pathMatch(.*)*', component: () => import('../views/NotFoundView.vue') },
  ],
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    if (to.path === '/roadmap' && typeof to.query.level === 'string' && /^\d+$/.test(to.query.level))
      return { el: '#level-' + to.query.level, top: 100 }
    return to.path === from.path ? false : { top: 0 }
  },
})
router.afterEach((to) => {
  const course = getCourse(String(to.params.slug ?? ''))
  document.title =
    (course ? course.title : to.path === '/roadmap' ? '完整学习路线' : 'Learn by Experimenting') +
    ' · CoreCraft'
})

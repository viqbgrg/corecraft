<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { courses } from '../courses'
import { useProgress } from '../composables/useProgress'
import { useTheme } from '../composables/useTheme'
import Icon from '../components/Icon.vue'
const route = useRoute()
const { preference, resolvedTheme } = useTheme()
const mobileNav = ref(false)
const mobileQuery = window.matchMedia('(max-width: 800px)')
const smallScreen = ref(mobileQuery.matches)
function resize(event: MediaQueryListEvent) {
  smallScreen.value = event.matches
}
function escape(event: KeyboardEvent) {
  if (event.key === 'Escape') mobileNav.value = false
}
onMounted(() => {
  mobileQuery.addEventListener('change', resize)
  window.addEventListener('keydown', escape)
})
onUnmounted(() => {
  mobileQuery.removeEventListener('change', resize)
  window.removeEventListener('keydown', escape)
})
const { completedIds } = useProgress()
const completedCount = computed(() => courses.filter((c) => completedIds.value.includes(c.id)).length)
const groups = [...new Set(courses.map((c) => c.category))].map((category) => ({
  category,
  courses: courses.filter((c) => c.category === category),
}))
watch(
  () => route.fullPath,
  () => {
    mobileNav.value = false
  },
)
function focusMain() {
  document.getElementById('main-content')?.focus()
}
</script>
<template>
  <a class="skip-link" href="#main-content" @click.prevent="focusMain">跳到课程内容</a>
  <header class="app-header">
    <div class="header-brand">
      <button
        class="icon-button mobile-menu"
        aria-label="打开课程导航"
        :aria-expanded="mobileNav"
        aria-controls="course-navigation"
        @click="mobileNav = !mobileNav"
      >
        <Icon :name="mobileNav ? 'close' : 'menu'" /></button
      ><RouterLink to="/learn/modeling" class="brand"
        ><span class="brand-symbol"><Icon name="cube" :size="25" /></span
        ><span>CoreCraft<span class="brand-dot">.</span></span></RouterLink
      ><span class="brand-divider" /><span class="brand-tagline">Make it make sense.</span>
    </div>
    <nav class="header-links" aria-label="主导航">
      <RouterLink to="/learn/modeling" :class="{ active: route.path.startsWith('/learn/') }"
        >学习空间</RouterLink
      ><RouterLink to="/roadmap" active-class="active">学习路线<Icon name="map" :size="15" /></RouterLink>
    </nav>
    <div class="header-actions">
      <label class="theme-switcher">
        <Icon
          :name="preference === 'system' ? 'monitor' : resolvedTheme === 'dark' ? 'moon' : 'sun'"
          :size="16"
        />
        <span>主题</span>
        <select v-model="preference" aria-label="切换主题">
          <option value="system">跟随系统</option>
          <option value="light">浅色</option>
          <option value="dark">深色</option>
        </select>
      </label>
      <a
        class="github-link"
        aria-label="CoreCraft GitHub 仓库（新窗口）"
        href="https://github.com/viqbgrg/corecraft"
        target="_blank"
        rel="noopener noreferrer"
        ><Icon name="github" :size="20" /><span>GitHub</span><Icon name="external" :size="13"
      /></a>
    </div>
  </header>
  <div class="workspace">
    <button v-if="mobileNav" class="nav-backdrop" aria-label="关闭课程导航" @click="mobileNav = false" />
    <aside
      id="course-navigation"
      class="course-sidebar"
      :inert="smallScreen && !mobileNav"
      :aria-hidden="smallScreen && !mobileNav ? true : undefined"
      :class="{ open: mobileNav }"
    >
      <div class="sidebar-intro">
        <span class="eyebrow">YOUR LEARNING PATH</span>
        <div>
          <h2>从原理出发</h2>
          <span class="version-tag">LEVEL 0–17</span>
        </div>
        <p>先动手，再恍然大悟。</p>
      </div>
      <div class="sidebar-progress">
        <div>
          <span>我的探索进度</span
          ><span class="mono"
            ><strong>{{ completedCount }}</strong> / {{ courses.length }}</span
          >
        </div>
        <progress
          :value="completedCount"
          :max="courses.length"
          :aria-label="'已完成 ' + completedCount + ' 节课程'"
        />
      </div>
      <nav class="course-navigation" aria-label="课程导航">
        <section v-for="group in groups" :key="group.category">
          <h3>{{ group.category }}</h3>
          <RouterLink
            v-for="course in group.courses"
            :key="course.id"
            :to="'/learn/' + course.slug"
            class="course-nav-item"
            active-class="selected"
            ><span class="course-number" :class="{ completed: completedIds.includes(course.id) }"
              ><Icon v-if="completedIds.includes(course.id)" name="check" :size="15" /><template v-else>{{
                String(courses.indexOf(course) + 1).padStart(2, '0')
              }}</template></span
            ><span
              ><b>{{ course.title }}</b
              ><small>{{ course.englishTitle }}</small></span
            ><span v-if="route.params.slug === course.slug" class="nav-active-dot"
          /></RouterLink>
        </section>
      </nav>
      <div class="sidebar-footer">
        <span class="mini-orbit"><Icon name="layers" :size="20" /></span>
        <div>
          <strong>知识不是孤岛。</strong>
          <p>把每一个“为什么”连起来。</p>
        </div>
        <RouterLink to="/roadmap">探索完整路线 <Icon name="arrow" :size="15" /></RouterLink>
      </div>
      <div class="sidebar-bottom"><i class="status-dot" />开源、免费，为好奇心而造。</div>
    </aside>
    <main id="main-content" class="main-shell" tabindex="-1">
      <slot />
      <footer class="site-footer">
        <span>CoreCraft © {{ new Date().getFullYear() }}</span
        ><span>少背诵，多观察。<i />Built for curious minds.</span
        ><a
          href="https://github.com/viqbgrg/corecraft/blob/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
          >MIT License<Icon name="external" :size="11"
        /></a>
      </footer>
    </main>
  </div>
</template>

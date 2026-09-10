<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { courses, getCourse } from '../courses'
import { useProgress } from '../composables/useProgress'
import type { LearningMode } from '../types/course'
import type { ExperimentView } from '../types/experiment'
import type { TutorContext } from '../types/tutor'
import ExperimentWorkbench from '../experiments/ExperimentWorkbench.vue'
import MarkdownContent from '../components/MarkdownContent.vue'
import ConceptLink from '../components/ConceptLink.vue'
import TutorDialog from '../components/TutorDialog.vue'
import Icon from '../components/Icon.vue'
import NotFoundView from './NotFoundView.vue'

const route = useRoute()
const router = useRouter()
const course = getCourse(String(route.params.slug))
const mode = computed<LearningMode>(() => route.query.mode === 'experiment' || route.query.mode === 'challenge' ? route.query.mode : 'learn')
const modes = [{ id: 'learn', title: 'Learn', subtitle: '理解原理', icon: 'book' }, { id: 'experiment', title: 'Experiment', subtitle: '动手实验', icon: 'terminal' }, { id: 'challenge', title: 'Challenge', subtitle: '检验理解', icon: 'flag' }] as const
const observed = ref<ExperimentView>()
const selected = ref('')
const submitted = ref(false)
const passed = ref(false)
const showHint = ref(false)
const tutor = ref<InstanceType<typeof TutorDialog>>()
const { complete, completedIds, persistent } = useProgress()
const index = course ? courses.indexOf(course) : -1
const previous = courses[index - 1]
const next = courses[index + 1]
const definition = course?.experiments[0]
const isCompleted = computed(() => !!course && completedIds.value.includes(course.id))
const canComplete = computed(() => observed.value?.goal.reached && passed.value)
const context = computed<TutorContext>(() => ({ courseId: course?.id ?? '', conceptIds: course?.concepts.map(c => c.id) ?? [], experimentId: definition?.id ?? '', mode: mode.value, metrics: observed.value?.metrics ?? [], observations: observed.value?.log.slice(-10) ?? [] }))
function setMode(value: LearningMode) { void router.replace({ query: { ...route.query, mode: value } }) }
function tabKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const current = modes.findIndex(m => m.id === mode.value)
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (current + (event.key === 'ArrowRight' ? 1 : 2)) % 3
  const target = modes[index]!
  setMode(target.id)
  void nextTick(() => document.getElementById('tab-' + target.id)?.focus())
}
function checkAnswer() {
  submitted.value = true
  if (selected.value === course?.challenge.answer) passed.value = true
}
function finish() { if (course && canComplete.value) complete(course.id) }
function readPrinciples() { document.getElementById('lesson-principles')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }) }
</script>

<template>
  <div v-if="course && definition" class="lesson-page">
    <div class="breadcrumbs"><RouterLink to="/roadmap">学习路径</RouterLink><Icon name="chevron" :size="12" /><span>{{ course.category }}</span><Icon name="chevron" :size="12" /><span class="current">{{ String(index + 1).padStart(2, '0') }}</span></div>
    <header class="lesson-heading"><div><span class="eyebrow">LESSON {{ String(index + 1).padStart(2, '0') }} <span>/</span> {{ course.englishTitle.toUpperCase() }}</span><h1>{{ course.title }}<span class="heading-dot">.</span></h1><p>{{ course.description }}</p><div class="lesson-meta"><span><Icon name="clock" :size="14" />约 {{ course.duration }} 分钟</span><span><Icon name="layers" :size="14" />Level {{ course.level }}</span><span class="meta-lab"><i class="status-dot" />互动实验</span></div></div><div class="lesson-index-art" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}<span>EXPLORE. UNDERSTAND.</span></div></header>
    <div class="lesson-body"><div class="lesson-primary">
      <div class="mode-tabs" role="tablist" aria-label="学习模式" @keydown="tabKey"><button v-for="tab in modes" :id="'tab-' + tab.id" :key="tab.id" role="tab" :aria-selected="mode === tab.id" :tabindex="mode === tab.id ? 0 : -1" aria-controls="learning-panel" :class="{ active: mode === tab.id }" @click="setMode(tab.id)"><Icon :name="tab.icon" :size="16" /><span>{{ tab.title }}<small>{{ tab.subtitle }}</small></span></button></div>
      <div id="learning-panel" role="tabpanel" :aria-labelledby="'tab-' + mode">
        <section v-if="mode === 'learn'" class="question-card"><div class="question-icon"><Icon name="lightbulb" :size="24" /></div><div><span class="eyebrow">从一个问题开始</span><h2>{{ course.question }}</h2><button class="text-button" @click="readPrinciples">先想一想，再用实验找到答案 <Icon name="arrowDown" :size="13" /></button></div></section>
        <section v-if="mode === 'challenge'" class="challenge-card"><div class="challenge-title"><span class="eyebrow">THINK BEFORE YOU CLICK</span><span class="tiny-badge">挑战 {{ String(index + 1).padStart(2, '0') }}</span></div><h2>{{ course.challenge.question }}</h2><fieldset><legend class="sr-only">选择你的解释</legend><label v-for="(option, i) in course.challenge.options" :key="option.id" :class="{ chosen: selected === option.id }"><input v-model="selected" type="radio" :value="option.id" name="answer" @change="submitted = false" /><span class="option-letter">{{ String.fromCharCode(65 + i) }}</span><span>{{ option.text }}</span></label></fieldset><div class="challenge-actions"><button class="button primary" :disabled="!selected" @click="checkAnswer">验证我的理解<Icon name="arrow" :size="15" /></button><button class="text-button" @click="showHint = !showHint"><Icon name="lightbulb" :size="15" />给我一点提示</button></div><p v-if="submitted" class="challenge-feedback" :class="{ success: selected === course.challenge.answer }" role="status">{{ selected === course.challenge.answer ? '理解正确。' + course.challenge.explanation : '再观察一下实验。' + course.challenge.hint }}</p><p class="challenge-footnote">可以随时操作下方实验，再回来验证你的解释。</p></section>
        <div v-if="showHint" class="hint-banner"><Icon name="lightbulb" /><p>{{ course.challenge.hint }}</p><button class="icon-button" aria-label="收起提示" @click="showHint = false"><Icon name="close" :size="16" /></button></div>
        <ExperimentWorkbench :key="definition.id" :definition="definition" @observe="observed = $event" />
        <section v-show="mode === 'learn'" id="lesson-principles" class="principles-section"><div class="section-heading"><span class="eyebrow">BEHIND THE EXPERIMENT</span><span>理解“为什么”</span></div><MarkdownContent :content="course.content" /><div class="concept-details"><h2>把概念连起来</h2><details v-for="concept in course.concepts" :key="concept.id" :open="route.query.concept === concept.id"><summary>{{ concept.title }}<Icon name="chevron" :size="15" /></summary><div><p>{{ concept.content }}</p><p><strong>为什么需要它？</strong>{{ concept.why }}</p><div class="concept-links"><ConceptLink v-for="id in concept.relatedConcepts" :key="id" :concept="id" /></div></div></details></div></section>
      </div>
      <section class="completion-card" :class="{ completed: isCompleted }"><div class="completion-icon"><Icon :name="isCompleted ? 'check' : 'flag'" :size="22" /></div><div><h2>{{ isCompleted ? '又一块计算机模型，搭好了。' : '把观察，变成自己的理解。' }}</h2><p>{{ isCompleted ? '你已完成本课。随时回来，再试一种可能。' : '完成实验目标，并在 Challenge 中解释你的发现。' }}</p><p v-if="!persistent" class="warning-label">浏览器未允许保存，当前完成记录仅保留在本次会话。</p></div><button class="button" :class="{ primary: canComplete && !isCompleted }" :disabled="!canComplete || isCompleted" @click="finish">{{ isCompleted ? '已完成' : '完成本课' }}<Icon name="check" :size="15" /></button></section>
      <nav class="lesson-pagination" aria-label="相邻课程"><RouterLink v-if="previous" :to="'/learn/' + previous.slug"><Icon name="back" /><span><small>上一课</small>{{ previous.title }}</span></RouterLink><RouterLink v-else to="/roadmap"><Icon name="map" /><span><small>你的起点</small>查看完整学习路线</span></RouterLink><RouterLink v-if="next" :to="'/learn/' + next.slug" class="next-lesson"><span><small>继续探索 · {{ String(index + 2).padStart(2, '0') }}</small>{{ next.title }}</span><Icon name="arrow" /></RouterLink><RouterLink v-else to="/roadmap" class="next-lesson"><span><small>下一段旅程</small>探索长期路线</span><Icon name="arrow" /></RouterLink></nav>
    </div>
    <aside class="lesson-rail" aria-label="本课指南"><section class="rail-section"><span class="eyebrow">IN THIS LESSON</span><h2>带走三个理解</h2><ol class="objectives"><li v-for="(objective, i) in course.objectives" :key="objective"><span>{{ String(i + 1).padStart(2, '0') }}</span>{{ objective }}</li></ol></section><section class="experiment-goal" :class="{ reached: observed?.goal.reached }"><div><Icon :name="observed?.goal.reached ? 'check' : 'flag'" :size="17" /><strong>{{ observed?.goal.reached ? '实验目标已达成' : '本次小任务' }}</strong></div><p>{{ observed?.goal.label ?? definition.question }}</p><span>{{ observed?.goal.reached ? '做得有依据，理解才牢固。' : '改一改输入，观察会发生什么。' }}</span></section><section class="rail-section lesson-checklist"><span class="eyebrow">YOUR PROGRESS</span><div :class="{ done: observed?.log.length }"><Icon :name="observed?.log.length ? 'check' : 'book'" :size="15" />开始操作模型</div><div :class="{ done: observed?.goal.reached }"><Icon :name="observed?.goal.reached ? 'check' : 'terminal'" :size="15" />完成实验目标</div><button :class="{ done: passed }" @click="setMode('challenge')"><Icon :name="passed ? 'check' : 'flag'" :size="15" />{{ passed ? '挑战回答正确' : '解释你的发现' }}<Icon v-if="!passed" name="chevron" :size="13" /></button></section><section class="tutor-card"><span class="tutor-card-icon"><Icon name="sparkles" :size="21" /></span><h2>保持好奇，<br />也允许自己卡住。</h2><p>让每一个“为什么”，<br />都有继续探索的方向。</p><button @click="tutor?.open()">Ask AI<Icon name="arrow" :size="16" /></button><span class="tutor-soon">AI TUTOR · COMING SOON</span></section><section class="rail-section knowledge-section"><span class="eyebrow">CONNECTED KNOWLEDGE</span><h3><Icon name="layers" :size="14" />先理解这些</h3><p v-if="!course.prerequisites.length" class="no-prerequisites">无需前置知识，带上好奇心即可。</p><div class="concept-links"><ConceptLink v-for="id in course.prerequisites" :key="id" :concept="id" /></div><h3><Icon name="arrow" :size="14" />然后可以探索</h3><div class="concept-links"><ConceptLink v-for="id in course.nextConcepts" :key="id" :concept="id" /></div></section><p class="local-progress-note"><Icon name="info" :size="14" />学习记录保存在当前浏览器。</p></aside></div>
    <TutorDialog ref="tutor" :context="context" :course-title="course.title" @hint="showHint = true" />
  </div>
  <NotFoundView v-else />
</template>

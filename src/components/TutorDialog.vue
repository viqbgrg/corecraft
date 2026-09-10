<script setup lang="ts">
import { ref } from 'vue'
import type { TutorContext } from '../types/tutor'
import { tutorProvider } from '../services/tutor'
import Icon from './Icon.vue'
const props = defineProps<{ context: TutorContext; courseTitle: string }>()
const emit = defineEmits<{ hint: [] }>()
const dialog = ref<HTMLDialogElement>()
const message = ref('')
async function open() {
  dialog.value?.showModal()
  const response = await tutorProvider.ask({ action: 'give-hint', context: props.context })
  message.value = response.message
}
function hint() { dialog.value?.close(); emit('hint') }
defineExpose({ open })
</script>
<template><dialog ref="dialog" class="tutor-dialog" aria-labelledby="tutor-title" @click="($event.target === dialog) && dialog?.close()"><div class="dialog-top"><span class="tutor-mark"><Icon name="sparkles" :size="28" /></span><button class="icon-button" aria-label="关闭 AI Tutor" @click="dialog?.close()"><Icon name="close" /></button></div><span class="eyebrow">A LITTLE HELP, A DEEPER UNDERSTANDING</span><h2 id="tutor-title">AI Tutor coming soon.</h2><p>{{ message || '正在准备当前课程的实验上下文。' }}</p><div class="tutor-context"><span class="panel-label">当前实验上下文 · 仅在本地</span><strong>{{ courseTitle }}</strong><div><span v-for="metric in context.metrics.slice(0, 3)" :key="metric.label">{{ metric.label }} <b>{{ metric.value }}</b></span></div><small>已记录 {{ context.observations.length }} 次最近操作。当前未接入 AI，也没有发送任何数据。</small></div><button class="button primary" @click="hint">先查看课程提示<Icon name="lightbulb" :size="16" /></button><p class="dialog-footnote">现在的提示由课程作者编写，不是 AI 生成。</p></dialog></template>

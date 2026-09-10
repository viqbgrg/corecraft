<script setup lang="ts">
import { computed } from 'vue'
import { conceptReference } from '../data/concepts'
import Icon from './Icon.vue'
const props = defineProps<{ concept: string }>()
const reference = computed(() => conceptReference(props.concept))
const target = computed(() => reference.value.courseId ? { path: '/learn/' + reference.value.courseId, query: { concept: props.concept } } : { path: '/roadmap', query: { level: String(reference.value.level) } })
</script>
<template><RouterLink :to="target" class="concept-link">{{ reference.title }}<Icon :name="reference.courseId ? 'chevron' : 'clock'" :size="13" /><span v-if="!reference.courseId" class="sr-only">（路线规划中）</span></RouterLink></template>

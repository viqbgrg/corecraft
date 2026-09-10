<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
const props = defineProps<{ content: string }>()
// Only build-time, repository-owned Markdown is accepted. Never render user or AI input here.
const html = computed(() => marked.parse(props.content, { async: false }))
</script>
<template><div class="lesson-markdown" v-html="html" /></template>

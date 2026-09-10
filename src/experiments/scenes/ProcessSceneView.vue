<script setup lang="ts">
import type { ProcessScene } from '../../types/experiment'
defineProps<{ scene: ProcessScene }>()
</script>
<template>
  <div class="process-scene scene-grid">
    <div class="scheduler-strip"><div class="processor-icon">CPU <strong>{{ scene.running ?? 'IDLE' }}</strong></div><div><span class="panel-label">ROUND ROBIN · 单核</span><p>时间片 {{ scene.used }} / {{ scene.quantum }} 步</p><div class="quantum-dots"><i v-for="n in scene.quantum" :key="n" :class="{ used: n <= scene.used }" /></div></div></div>
    <div class="process-grid"><section v-for="process in scene.processes" :key="process.id" class="process-box"><div class="panel-label">{{ process.name }}<span>独立地址空间</span></div><div class="process-shared">共享计数器 <b>{{ process.memory }}</b><small>只在线程所属进程内共享</small></div><div v-for="thread in scene.threads.filter(t => t.process === process.id)" :key="thread.id" class="thread-card" :class="thread.state.toLowerCase()"><div><b>{{ thread.name }}</b><span class="state-pill">{{ thread.state }}</span></div><p><code>PC {{ thread.pc }}</code><code>STACK [{{ thread.stack.join(', ') || '∅' }}]</code></p></div></section></div>
  </div>
</template>

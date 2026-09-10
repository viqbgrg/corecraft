<script setup lang="ts">
import type { CacheScene } from '../../types/experiment'
import { hex } from '../core/session'
defineProps<{ scene: CacheScene }>()
</script>
<template>
  <div class="cache-scene scene-grid">
    <div class="memory-hierarchy"><template v-for="(label, i) in ['CPU', 'L1 Cache', 'L2 Cache', 'Memory']" :key="label"><span v-if="i" class="hierarchy-arrow">→</span><div :class="{ active: scene.path && (i < 2 || i === 2 && scene.path !== 'L1' || i === 3 && scene.path === 'RAM'), memory: i === 3 }"><span>{{ label }}</span><small>{{ ['发出地址', '1 模拟周期', '8 模拟周期', '80 模拟周期'][i] }}</small></div></template></div>
    <div class="cache-tables"><section v-for="level in scene.levels" :key="level.name"><div class="panel-label">{{ level.name }}<span>{{ level.lines.length }} LINES × {{ scene.lineSize }} B</span></div><div v-for="line in level.lines" :key="line.index" class="cache-line" :class="{ active: line.active }"><span class="line-number">{{ line.index }}</span><span class="cache-valid" :class="{ valid: line.block !== null }" /><code>{{ line.block === null ? 'EMPTY' : hex(line.block * scene.lineSize) + ' – ' + hex(line.block * scene.lineSize + scene.lineSize - 1) }}</code><small>{{ line.active ? '● CURRENT' : line.block !== null ? 'VALID' : '—' }}</small></div></section></div>
    <div v-if="scene.recent.length" class="recent-accesses"><span class="panel-label">RECENT</span><span v-for="(access, i) in scene.recent" :key="i" :class="{ miss: access.source === 'RAM' }"><code>{{ hex(access.address) }}</code><small>{{ access.source }}</small></span></div>
  </div>
</template>

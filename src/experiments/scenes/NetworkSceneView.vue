<script setup lang="ts">
import { computed, useId } from 'vue'
import type { NetworkScene } from '../../types/experiment'
const props = defineProps<{ scene: NetworkScene }>()
const uid = useId().replace(/:/g, '')
const width = computed(() => Math.max(660, props.scene.nodes.length * 170))
const messages = computed(() => props.scene.messages.slice(-8))
const height = computed(() => 132 + Math.max(messages.value.length, 3) * 65)
const x = (id: string) => 95 + props.scene.nodes.findIndex(n => n.id === id) * (width.value - 190) / Math.max(props.scene.nodes.length - 1, 1)
</script>
<template>
  <div class="network-scene scene-grid">
    <div v-if="scene.layout === 'sequence'" class="sequence-scroll">
      <svg :viewBox="'0 0 ' + width + ' ' + height" :style="{ minWidth: scene.nodes.length > 2 ? '660px' : '500px' }" role="img" :aria-label="scene.caption" class="sequence-svg">
        <defs><marker :id="uid + '-arrow'" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="context-stroke" /></marker></defs>
        <g v-for="node in scene.nodes" :key="node.id"><rect :x="x(node.id) - 70" y="9" width="140" height="76" rx="11" :class="node.active ? 'network-node active' : 'network-node'" /><text :x="x(node.id)" y="33" class="node-title">{{ node.label }}</text><text :x="x(node.id)" y="52" class="node-subtitle">{{ node.subtitle }}</text><text :x="x(node.id)" y="71" class="node-state">{{ node.state }}</text><line :x1="x(node.id)" :x2="x(node.id)" y1="87" :y2="height - 12" class="lifeline" /></g>
        <g v-for="(message, i) in messages" :key="i" :class="'packet packet-' + message.tone">
          <line :x1="x(message.from)" :x2="message.lost ? (x(message.from) + x(message.to)) / 2 : x(message.to)" :y1="132 + i * 65" :y2="132 + i * 65" :stroke-dasharray="message.lost ? '5 5' : undefined" :marker-end="message.lost ? undefined : 'url(#' + uid + '-arrow)'" />
          <text :x="(x(message.from) + x(message.to)) / 2" :y="122 + i * 65" class="packet-label">{{ message.label }}{{ message.lost ? ' × 丢失' : '' }}</text>
          <text :x="(x(message.from) + x(message.to)) / 2" :y="151 + i * 65" class="packet-detail">{{ message.detail }}</text>
        </g>
        <text v-if="!messages.length" :x="width / 2" y="180" class="empty-diagram-label">等待你发出第一条消息</text>
      </svg>
    </div>
    <template v-else><div class="pipeline-track"><template v-for="(node, i) in scene.nodes" :key="node.id"><span v-if="i" class="pipeline-arrow">→</span><div class="pipeline-node" :class="{ active: node.active, done: node.state === '完成' || node.state === '复用' || node.state === '跳过' }"><span class="pipeline-number">0{{ i + 1 }}</span><b>{{ node.label }}</b><small>{{ node.subtitle }}</small><span class="state-pill">{{ node.state }}</span></div></template></div><div v-if="messages.length" class="pipeline-message"><span class="panel-label">{{ messages.at(-1)?.label }}</span><p>{{ messages.at(-1)?.detail }}</p></div></template>
    <p class="diagram-caption">{{ scene.caption }}</p>
  </div>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import type { GraphScene } from '../../types/experiment'
const props = defineProps<{ scene: GraphScene }>()
const uid = useId().replace(/:/g, '')
function geometry(edge: GraphScene['edges'][number]) {
  const a = props.scene.nodes.find((n) => n.id === edge.from)!,
    b = props.scene.nodes.find((n) => n.id === edge.to)!
  const length = Math.hypot(b.x - a.x, b.y - a.y),
    dx = (b.x - a.x) / length,
    dy = (b.y - a.y) / length
  const curved =
    props.scene.directed && props.scene.edges.some((e) => e.from === edge.to && e.to === edge.from)
  const x = (a.x + b.x) / 2 - dy * (curved ? 28 : 0),
    y = (a.y + b.y) / 2 + dx * (curved ? 28 : 0)
  return {
    d: `M${a.x + dx * 22},${a.y + dy * 22} Q${x},${y} ${b.x - dx * 26},${b.y - dy * 26}`,
    x: (a.x + 2 * x + b.x) / 4,
    y: (a.y + 2 * y + b.y) / 4 - 6,
  }
}
</script>

<template>
  <div class="graph-scene">
    <svg
      viewBox="0 0 420 305"
      role="img"
      :aria-label="(scene.directed ? '有向' : '无向') + '加权图，绿色边表示目标路径'"
    >
      <defs>
        <marker
          :id="uid + '-arrow'"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0 0L10 5L0 10Z" fill="context-stroke" />
        </marker>
      </defs>
      <g v-for="edge in scene.edges" :key="edge.from + '-' + edge.to">
        <path
          :d="geometry(edge).d"
          fill="none"
          :stroke="edge.active ? 'var(--green)' : 'var(--line-strong)'"
          :stroke-width="edge.active ? 3 : 1.5"
          :marker-end="scene.directed ? 'url(#' + uid + '-arrow)' : undefined"
        />
        <text :x="geometry(edge).x" :y="geometry(edge).y" class="edge-weight">{{ edge.weight }}</text>
        <title>{{ edge.from }} {{ scene.directed ? '→' : '↔' }} {{ edge.to }}，权重 {{ edge.weight }}</title>
      </g>
      <g v-for="node in scene.nodes" :key="node.id">
        <circle
          :cx="node.x"
          :cy="node.y"
          r="21"
          :fill="
            node.current ? 'var(--warning-selected)' : node.visited ? 'var(--green-pale)' : 'var(--surface)'
          "
          :stroke="node.current ? 'var(--warning)' : 'var(--green)'"
          stroke-width="2"
        />
        <text :x="node.x" :y="node.y + 5" class="node-name">{{ node.id }}</text>
        <text :x="node.x" :y="node.y + 38" class="node-distance">d={{ node.distance }}</text>
      </g>
    </svg>
    <p class="frontier">
      <strong>待处理：</strong>{{ scene.frontier.join(' → ') || '空' }}<br /><strong>目标路径：</strong
      >{{ scene.path.join(' → ') || '尚未到达' }}
    </p>
    <table>
      <caption>
        当前距离与前驱
      </caption>
      <thead>
        <tr>
          <th scope="col">顶点</th>
          <th scope="col">距离</th>
          <th scope="col">前驱</th>
          <th scope="col">已访问</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="node in scene.nodes" :key="node.id">
          <th scope="row">{{ node.id }}</th>
          <td>{{ node.distance }}</td>
          <td>{{ node.parent ?? '—' }}</td>
          <td>{{ node.visited ? '是' : '否' }}</td>
        </tr>
      </tbody>
    </table>
    <p class="graph-caption">{{ scene.caption }}</p>
  </div>
</template>

<style scoped>
.graph-scene {
  padding: 20px;
  min-width: 0;
}
svg {
  display: block;
  width: 100%;
  max-height: 360px;
}
.node-name,
.edge-weight,
.node-distance {
  text-anchor: middle;
  font-family: var(--mono);
  fill: var(--ink);
}
.node-name {
  font-size: 15px;
  font-weight: 600;
}
.edge-weight {
  font-size: 12px;
  paint-order: stroke;
  stroke: var(--surface-soft);
  stroke-width: 4px;
  stroke-linejoin: round;
}
.node-distance {
  font-size: 11px;
}
.frontier,
.graph-caption {
  font-size: 12px;
  line-height: 1.8;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.graph-caption {
  color: var(--muted);
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
  text-align: left;
}
caption {
  text-align: left;
  font-weight: 600;
  margin-bottom: 8px;
}
th,
td {
  border-top: 1px solid var(--line);
  padding: 8px;
}
th {
  font-weight: 500;
}
@media (max-width: 600px) {
  .graph-scene {
    padding: 12px;
  }
}
</style>

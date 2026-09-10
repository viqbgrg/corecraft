<script setup lang="ts">
import { useId } from 'vue'
import type { TreeScene } from '../../types/experiment'
const props = defineProps<{ scene: TreeScene }>()
const uid = useId().replace(/:/g, '')
const node = (id: string) => props.scene.nodes.find((n) => n.id === id)!
</script>
<template>
  <div class="tree-scene scene-grid">
    <div class="tree-legend">
      <span><i />内部节点 · 导航</span><span><i class="leaf" />叶子节点 · 记录</span
      ><span><i class="path" />访问路径</span>
    </div>
    <div class="tree-scroll" tabindex="0" role="region" aria-label="可横向滚动的 B+Tree">
      <svg
        :viewBox="'0 0 ' + scene.width + ' ' + scene.height"
        :style="{ minWidth: scene.width + 'px' }"
        role="img"
        aria-label="B+Tree 当前结构，所有记录保存在叶子层"
      >
        <defs>
          <marker
            :id="uid + '-leaf'"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0 0 10 5 0 10Z" fill="#29947d" />
          </marker>
        </defs>
        <path
          v-for="edge in scene.edges"
          :key="edge.from + edge.to"
          :d="
            'M' +
            node(edge.from).x +
            ',' +
            (node(edge.from).y + 40) +
            ' C' +
            node(edge.from).x +
            ',' +
            (node(edge.from).y + 78) +
            ' ' +
            node(edge.to).x +
            ',' +
            (node(edge.to).y - 32) +
            ' ' +
            node(edge.to).x +
            ',' +
            node(edge.to).y
          "
          class="tree-edge"
          :class="{ visited: scene.path.includes(edge.from) && scene.path.includes(edge.to) }"
        />
        <line
          v-for="edge in scene.leafLinks"
          :key="edge.from + '-' + edge.to"
          :x1="node(edge.from).x + node(edge.from).width / 2 + 4"
          :y1="node(edge.from).y + 20"
          :x2="node(edge.to).x - node(edge.to).width / 2 - 5"
          :y2="node(edge.to).y + 20"
          class="leaf-link"
          :marker-end="'url(#' + uid + '-leaf)'"
        />
        <g v-for="n in scene.nodes" :key="n.id">
          <rect
            :x="n.x - n.width / 2"
            :y="n.y"
            :width="n.width"
            height="40"
            rx="8"
            class="tree-node"
            :class="{ leaf: n.leaf, visited: scene.path.includes(n.id) }"
          />
          <template v-for="(key, i) in n.keys" :key="key">
            <line
              v-if="i"
              :x1="n.x - n.width / 2 + i * (n.width / n.keys.length)"
              :x2="n.x - n.width / 2 + i * (n.width / n.keys.length)"
              :y1="n.y + 8"
              :y2="n.y + 32"
              class="key-divider"
            />
            <text
              :x="n.x - n.width / 2 + (i + 0.5) * (n.width / n.keys.length)"
              :y="n.y + 25"
              class="tree-key"
              :class="{ found: n.leaf && scene.found === key }"
            >
              {{ key }}
            </text>
          </template>
          <text v-if="!n.keys.length" :x="n.x" :y="n.y + 25" class="tree-key">∅</text>
          <text :x="n.x" :y="n.y + 57" class="tree-node-label">{{ n.leaf ? 'LEAF' : 'INTERNAL' }}</text>
        </g>
      </svg>
    </div>
  </div>
</template>

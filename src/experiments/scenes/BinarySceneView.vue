<script setup lang="ts">
import { computed } from 'vue'
import type { BinaryScene, ExperimentAction } from '../../types/experiment'
const props = defineProps<{ scene: BinaryScene }>()
const emit = defineEmits<{ action: [action: ExperimentAction] }>()
const bits = computed(() => Array.from({ length: props.scene.width }, (_, i) => props.scene.width - i - 1))
const valueAt = (n: number, bit: number) => (n >> bit) & 1
const terms = computed(
  () =>
    bits.value
      .filter((bit) => valueAt(props.scene.a, bit))
      .map((bit) => 2 ** bit)
      .join(' + ') || '0',
)
</script>

<template>
  <div class="binary-scene scene-grid">
    <div class="scene-eyebrow">
      <span><i class="status-dot" />8-BIT UNSIGNED</span><span>点击比特，改变状态 ↙</span>
    </div>
    <div class="bits-table" :style="{ '--bit-count': scene.width }">
      <div class="bits-row bit-weights">
        <span>位权</span
        ><span v-for="bit in bits" :key="bit"
          ><small
            >2<sup>{{ bit }}</sup></small
          >{{ 2 ** bit }}</span
        ><span>DEC</span>
      </div>
      <div v-for="row in ['a', 'b'] as const" :key="row" class="bits-row">
        <span class="bit-row-label">{{ row.toUpperCase() }}</span>
        <button
          v-for="bit in bits"
          :key="bit"
          class="bit-button"
          :class="{ on: valueAt(scene[row], bit), secondary: row === 'b' }"
          :aria-label="row.toUpperCase() + ' 的第 ' + bit + ' 位，当前 ' + valueAt(scene[row], bit)"
          :aria-pressed="!!valueAt(scene[row], bit)"
          @click="emit('action', { type: 'toggle-' + row, value: bit })"
        >
          {{ valueAt(scene[row], bit) }}
        </button>
        <span class="bit-decimal">{{ scene[row] }}</span>
      </div>
      <div class="bit-operation-line">
        <span>{{ scene.operation === 'ADD' ? '+' : scene.operation }}</span
        ><span>{{
          scene.operation === 'ADD'
            ? '逐位相加，向高位进位'
            : scene.operation === 'AND'
              ? '两位都为 1，结果才为 1'
              : scene.operation === 'OR'
                ? '至少一位为 1，结果就为 1'
                : '两位不同，结果才为 1'
        }}</span>
      </div>
      <div class="bits-row result-row">
        <span class="bit-row-label">=</span
        ><span
          v-for="bit in bits"
          :key="bit"
          class="bit-result"
          :class="{ on: valueAt(scene.result, bit) }"
          >{{ valueAt(scene.result, bit) }}</span
        ><span class="bit-decimal">{{ scene.result }}</span>
      </div>
    </div>
    <div class="bit-equation">
      <span
        ><b>A</b
        ><span class="mono"
          >{{ terms }} = <strong>{{ scene.a }}</strong></span
        ></span
      ><span v-if="scene.operation === 'ADD'" class="carry-badge" :class="{ overflow: scene.carry }"
        >Carry <b>{{ scene.carry }}</b></span
      ><span v-else class="bit-note">一个开关，一份权重。</span>
    </div>
  </div>
</template>

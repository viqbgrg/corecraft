<script setup lang="ts">
import type { CpuScene } from '../../types/experiment'
import { hex } from '../core/session'
defineProps<{ scene: CpuScene }>()
</script>
<template>
  <div class="cpu-scene scene-grid">
    <div class="cpu-phases">
      <span
        v-for="(phase, i) in ['Fetch', 'Decode', 'Execute', 'Write Back']"
        :key="phase"
        :class="{ active: scene.phase === phase }"
        ><small>0{{ i + 1 }}</small
        >{{ phase }}</span
      >
    </div>
    <div class="cpu-board">
      <div class="code-window">
        <div class="panel-label">
          INSTRUCTION MEMORY<span class="tiny-badge">PC {{ scene.pc }}</span>
        </div>
        <div
          v-for="(line, i) in scene.program"
          :key="i"
          class="code-line"
          :class="{ active: scene.activeInstruction === i }"
        >
          <span class="line-number">{{ String(i).padStart(2, '0') }}</span
          ><code>{{ line }}</code
          ><span v-if="scene.pc === i" class="pc-pointer">← PC</span>
        </div>
        <div class="code-caption">高亮为当前指令 · PC 指向下一次取指位置</div>
      </div>
      <div class="cpu-parts">
        <div class="hardware-box ir-box">
          <span class="panel-label">INSTRUCTION REGISTER</span><code>{{ scene.instruction }}</code>
        </div>
        <div class="bus-line">↓ 数据总线</div>
        <div class="alu-box">
          <span>ALU</span><strong class="mono">{{ scene.alu }}</strong>
        </div>
        <div class="bus-line">↓ Write Back</div>
        <div class="registers">
          <div v-for="(value, name) in scene.registers" :key="name">
            <span>{{ name }}</span
            ><strong>{{ value }}</strong>
          </div>
        </div>
      </div>
    </div>
    <div class="memory-strip">
      <span class="panel-label">DATA MEMORY</span
      ><span v-for="cell in scene.memory" :key="cell.address"
        ><code>{{ hex(cell.address, 2) }}</code
        ><b>{{ cell.value }}</b></span
      ><span v-if="scene.halted" class="success-label">HALTED ✓</span>
    </div>
  </div>
</template>

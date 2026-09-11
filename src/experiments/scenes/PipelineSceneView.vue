<script setup lang="ts">
import type { PipelineCycle, PipelineScene } from '../../types/experiment'
import { hex } from '../core/session'
defineProps<{ scene: PipelineScene }>()
const stages = ['IF', 'ID', 'EX', 'MEM', 'WB']
function stageAt(cycle: PipelineCycle, instruction: number): string {
  const index = cycle.stages.indexOf(instruction)
  return index < 0 ? '—' : stages[index]! + (cycle.stalled && index < 2 ? ' · 停' : '')
}
</script>

<template>
  <div class="instruction-pipeline-scene scene-grid">
    <div class="scene-eyebrow">
      <span>INSTRUCTION PIPELINE</span><span class="mono">CYCLE {{ scene.cycle }}</span>
    </div>
    <div class="pipeline-stages" aria-label="本周期的五个阶段">
      <div
        v-for="stage in scene.stages"
        :key="stage.name"
        class="stage-card"
        :class="{ occupied: stage.instruction !== null, waiting: stage.note }"
      >
        <span class="panel-label"
          >{{ stage.name }}<small>{{ stage.note }}</small></span
        >
        <strong>{{
          stage.instruction === null ? stage.note || '空闲' : 'I' + (stage.instruction + 1)
        }}</strong>
        <code v-if="stage.instruction !== null">{{ scene.program[stage.instruction] }}</code>
      </div>
    </div>
    <p class="pipeline-caption">{{ scene.caption }}</p>
    <div class="pipeline-timeline" role="region" aria-label="流水线周期时序表" tabindex="0">
      <table>
        <caption>
          每条指令经过哪些阶段？“停”表示等待数据，较早的指令继续推进。
        </caption>
        <thead>
          <tr>
            <th scope="col">指令</th>
            <th v-for="cycle in scene.history" :key="cycle.cycle" scope="col">C{{ cycle.cycle }}</th>
            <th v-if="!scene.history.length" scope="col">等待时钟</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(instruction, index) in scene.program" :key="index">
            <th scope="row">
              <span class="instruction-id">I{{ index + 1 }}</span
              ><code>{{ instruction }}</code>
            </th>
            <td
              v-for="cycle in scene.history"
              :key="cycle.cycle"
              :class="{
                active: cycle.stages.includes(index),
                stalled: cycle.stalled && cycle.stages.slice(0, 2).includes(index),
                committed: cycle.stages[4] === index,
              }"
            >
              {{ stageAt(cycle, index) }}
            </td>
            <td v-if="!scene.history.length">—</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="pipeline-storage">
      <div class="registers" aria-label="已写回的寄存器值">
        <div v-for="(value, name) in scene.registers" :key="name">
          <span>{{ name }}</span
          ><strong>{{ value }}</strong>
        </div>
      </div>
      <div class="pipeline-memory" aria-label="数据内存">
        <span class="panel-label">DATA MEMORY</span>
        <span v-for="cell in scene.memory" :key="cell.address"
          ><code>{{ hex(cell.address, 2) }}</code
          ><strong class="mono">{{ cell.value }}</strong></span
        >
      </div>
    </div>
    <div
      v-if="scene.comparison.length"
      class="pipeline-comparison"
      role="region"
      aria-label="三种执行方式对照"
      tabindex="0"
    >
      <table>
        <caption>
          相同程序、相同初始数据 · 所有指令完成后的总周期
        </caption>
        <thead>
          <tr>
            <th scope="col">执行方式</th>
            <th scope="col">总周期</th>
            <th scope="col">数据停顿</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in scene.comparison" :key="row.label">
            <th scope="row">{{ row.label }}</th>
            <td>{{ row.cycles }}</td>
            <td>{{ row.stalls }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.instruction-pipeline-scene {
  min-width: 0;
}
.pipeline-stages {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.stage-card {
  min-width: 0;
  min-height: 117px;
  padding: 12px 10px;
  border: 1px dashed var(--line-strong);
  border-radius: 8px;
  background: var(--surface-soft);
}
.stage-card.occupied {
  border-style: solid;
  border-color: var(--green-border);
  background: var(--green-pale);
}
.stage-card.waiting {
  border-color: #d9c590;
  background: #fff7e2;
}
.stage-card strong {
  display: block;
  font-family: var(--mono);
  font-size: 19px;
  margin: 10px 0 6px;
}
.stage-card code {
  display: block;
  overflow-wrap: anywhere;
  font-size: 11px;
  line-height: 1.7;
}
.stage-card small {
  font-size: 11px;
  color: #765716;
}
.pipeline-caption {
  font-size: 12px;
  line-height: 1.8;
  color: var(--text);
  margin: 16px 0;
}
.pipeline-timeline,
.pipeline-comparison {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}
.pipeline-timeline:focus-visible,
.pipeline-comparison:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 3px;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
}
caption {
  padding: 12px;
  text-align: left;
  color: var(--text);
  line-height: 1.7;
  font-size: 12px;
}
th,
td {
  padding: 9px 11px;
  text-align: center;
  border-top: 1px solid var(--line);
  white-space: nowrap;
}
thead th {
  background: var(--green-pale);
  color: var(--text);
  font-weight: 500;
}
tbody th {
  text-align: left;
  font-weight: 500;
}
.pipeline-timeline tbody th {
  background: var(--surface);
}
.instruction-id {
  display: inline-block;
  margin-right: 10px;
  color: var(--text);
  font-family: var(--mono);
}
td {
  font-family: var(--mono);
}
td.active {
  background: var(--green-pale);
  color: var(--green);
}
td.stalled {
  background: #fff1cc;
  color: #765716;
}
td.committed {
  background: var(--green);
  color: var(--on-accent);
}
.pipeline-storage {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 18px;
  align-items: start;
}
.pipeline-storage .registers {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.pipeline-memory {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}
.pipeline-memory > span:not(.panel-label) {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}
.pipeline-memory .panel-label {
  width: 100%;
}
.pipeline-comparison {
  margin-top: 18px;
}
@media (max-width: 600px) {
  .instruction-pipeline-scene {
    padding: 16px 12px;
  }
  .pipeline-stages {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .stage-card {
    min-height: 95px;
  }
  .pipeline-storage {
    grid-template-columns: minmax(0, 1fr);
  }
  .scene-eyebrow {
    flex-wrap: wrap;
  }
}
</style>

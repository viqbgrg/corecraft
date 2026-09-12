<script setup lang="ts">
import type { BranchPredictionScene } from '../../types/experiment'
defineProps<{ scene: BranchPredictionScene }>()
function direction(taken: boolean): string {
  return taken ? 'T' : 'N'
}
</script>

<template>
  <div class="branch-scene scene-grid">
    <div class="scene-eyebrow">
      <span>BRANCH PREDICTOR</span><span>{{ scene.strategy }}</span>
    </div>
    <div
      v-if="scene.states.length"
      class="predictor-states"
      :style="{ '--states': scene.states.length }"
      aria-label="预测器状态"
    >
      <div
        v-for="state in scene.states"
        :key="state.value"
        class="predictor-state"
        :class="{ current: scene.counter === state.value }"
        :aria-current="scene.counter === state.value ? 'step' : undefined"
      >
        <span>{{ scene.counter === state.value ? '当前状态' : '可达状态' }}</span>
        <strong>{{ state.label }}</strong
        ><small>预测 {{ state.predicts ? 'T · 跳转' : 'N · 不跳转' }}</small>
      </div>
    </div>
    <p v-else class="static-prediction">静态策略始终预测 N（不跳转），不根据结果更新状态。</p>
    <p class="branch-caption">{{ scene.caption }}</p>
    <div class="branch-decision">
      <span>{{
        scene.cursor === scene.sequence.length ? '本组已完成' : '第 ' + (scene.cursor + 1) + ' 次分支'
      }}</span>
      <strong v-if="scene.pending">预测 {{ direction(scene.pending.predicted) }} · 等待揭晓</strong>
      <strong v-else>{{ scene.cursor === scene.sequence.length ? '比较不同策略的代价' : '等待预测' }}</strong>
    </div>
    <div class="outcome-sequence" aria-label="输入的分支结果序列">
      <span
        v-for="(taken, index) in scene.sequence"
        :key="index"
        :class="{
          correct: scene.trials[index]?.correct,
          missed: scene.trials[index] && !scene.trials[index]?.correct,
          pending: scene.pending?.index === index,
        }"
        :aria-label="
          '第 ' +
          (index + 1) +
          ' 次：' +
          (taken ? '跳转' : '不跳转') +
          (scene.trials[index]
            ? scene.trials[index]?.correct
              ? '，预测正确'
              : '，预测失败'
            : scene.pending?.index === index
              ? '，等待揭晓'
              : '，待预测')
        "
      >
        <small>{{ index + 1 }}</small
        ><b>{{ direction(taken) }}</b
        ><small>{{ scene.trials[index] ? (scene.trials[index]?.correct ? '✓' : '×') : '·' }}</small>
      </span>
    </div>
    <div
      v-if="scene.trials.length"
      class="prediction-history"
      role="region"
      aria-label="分支预测记录"
      tabindex="0"
    >
      <table>
        <caption>
          预测在前，训练在后 · T 跳转 / N 不跳转
        </caption>
        <thead>
          <tr>
            <th scope="col">分支</th>
            <th scope="col">更新前</th>
            <th scope="col">预测</th>
            <th scope="col">实际</th>
            <th scope="col">更新后</th>
            <th scope="col">额外周期</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="trial in scene.trials" :key="trial.index" :class="{ missed: !trial.correct }">
            <th scope="row">{{ trial.index + 1 }}</th>
            <td>
              {{
                scene.states.length
                  ? trial.before.toString(2).padStart(scene.states.length === 4 ? 2 : 1, '0')
                  : '—'
              }}
            </td>
            <td>{{ direction(trial.predicted) }}</td>
            <td>{{ direction(trial.actual) }} {{ trial.correct ? '✓' : '×' }}</td>
            <td>
              {{
                scene.states.length
                  ? trial.after.toString(2).padStart(scene.states.length === 4 ? 2 : 1, '0')
                  : '—'
              }}
            </td>
            <td>+{{ trial.penalty }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-if="scene.comparison.length"
      class="prediction-comparison"
      role="region"
      aria-label="三种预测策略对照"
      tabindex="0"
    >
      <table>
        <caption>
          相同序列，从初始状态独立运行 · 1 位初始为 0，2 位初始为 01
        </caption>
        <thead>
          <tr>
            <th scope="col">策略</th>
            <th scope="col">正确率</th>
            <th scope="col">失败次数</th>
            <th scope="col">额外周期</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in scene.comparison" :key="row.label">
            <th scope="row">{{ row.label }}</th>
            <td>{{ ((row.correct / scene.sequence.length) * 100).toFixed(1) }}%</td>
            <td>{{ row.misses }}</td>
            <td>{{ row.extraCycles }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.branch-scene {
  min-width: 0;
}
.predictor-states {
  display: grid;
  grid-template-columns: repeat(var(--states), minmax(0, 1fr));
  gap: 8px;
}
.predictor-state {
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: 8px;
  padding: 13px 11px;
}
.predictor-state.current {
  border: 2px solid var(--green);
  padding: 12px 10px;
  background: var(--green-pale);
}
.predictor-state > span {
  font-size: 11px;
  color: var(--text);
}
.predictor-state strong {
  display: block;
  font-size: 13px;
  margin: 10px 0 7px;
  line-height: 1.6;
}
.predictor-state small {
  font-size: 11px;
  color: var(--text);
}
.branch-caption,
.static-prediction {
  color: var(--text);
  font-size: 12px;
  line-height: 1.8;
  margin: 16px 0;
}
.branch-decision {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 7px;
}
.branch-decision strong {
  color: var(--green);
}
.outcome-sequence {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 16px 0;
}
.outcome-sequence > span {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 33px;
  padding: 6px;
  font-family: var(--mono);
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface);
}
.outcome-sequence small {
  font-size: 10px;
}
.outcome-sequence .correct {
  background: var(--green-pale);
  color: var(--green);
}
.outcome-sequence .missed {
  background: var(--warning-selected);
  color: var(--warning);
}
.outcome-sequence .pending {
  outline: 2px solid var(--green);
  outline-offset: 1px;
}
.prediction-history,
.prediction-comparison {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  margin-top: 16px;
}
.prediction-history {
  max-height: 310px;
}
.prediction-history:focus-visible,
.prediction-comparison:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 3px;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
caption {
  text-align: left;
  padding: 12px;
  line-height: 1.7;
  color: var(--text);
  font-size: 12px;
}
th,
td {
  border-top: 1px solid var(--line);
  padding: 9px 12px;
  text-align: center;
  white-space: nowrap;
}
th {
  font-weight: 500;
}
thead th {
  background: var(--green-pale);
  color: var(--text);
}
td {
  font-family: var(--mono);
}
tbody tr.missed {
  background: var(--warning-surface);
  color: var(--warning);
}
.prediction-comparison tbody th {
  text-align: left;
}
@media (max-width: 600px) {
  .branch-scene {
    padding: 16px 12px;
  }
  .predictor-states {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .scene-eyebrow {
    flex-wrap: wrap;
  }
}
</style>

<script setup lang="ts">
import type { DataScene } from '../../types/experiment'
defineProps<{ scene: DataScene }>()
</script>

<template>
  <div class="data-scene" role="group" :aria-label="scene.title">
    <h3>{{ scene.title }}</h3>
    <dl v-if="scene.cards?.length" class="data-cards">
      <div v-for="card in scene.cards" :key="card.id" :class="card.tone">
        <dt>{{ card.label }}</dt>
        <dd class="mono">{{ card.value }}</dd>
        <dd v-if="card.detail" class="card-detail">{{ card.detail }}</dd>
      </div>
    </dl>
    <ol v-if="scene.sequence?.length" class="data-sequence" aria-label="执行轨迹">
      <li v-for="(item, i) in scene.sequence" :key="i" :class="item.tone">
        <span>{{ item.label }}</span
        ><strong class="mono">{{ item.value }}</strong>
      </li>
    </ol>
    <div
      v-for="table in scene.tables"
      :key="table.id"
      class="data-table-scroll"
      role="region"
      :aria-label="table.title"
      tabindex="0"
    >
      <table :data-table="table.id">
        <caption>
          {{
            table.title
          }}
        </caption>
        <thead>
          <tr>
            <th
              v-for="(column, i) in table.columns"
              :key="i"
              scope="col"
              :class="{ 'data-nowrap': table.nowrapColumns?.includes(i) }"
            >
              {{ column }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in table.rows" :key="row.id" :class="row.tone">
            <template v-for="(value, i) in row.values" :key="i">
              <th v-if="i === 0" scope="row" :class="{ 'data-nowrap': table.nowrapColumns?.includes(i) }">
                {{ value }}
              </th>
              <td v-else :class="{ 'data-nowrap': table.nowrapColumns?.includes(i) }">{{ value }}</td>
            </template>
          </tr>
          <tr v-if="!table.rows.length">
            <td :colspan="table.columns.length" class="data-empty">等待操作</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="data-caption">{{ scene.caption }}</p>
  </div>
</template>

<style scoped>
.data-scene {
  padding: 24px;
  min-width: 0;
}
h3 {
  margin: 0 0 18px;
  font-size: 15px;
}
.data-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: 10px;
  margin: 0 0 20px;
}
.data-cards > div {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  min-width: 0;
}
dt,
.card-detail {
  font-size: 12px;
  color: var(--muted);
}
dd {
  margin: 6px 0 0;
  overflow-wrap: anywhere;
}
dd.mono {
  font-size: 16px;
  font-weight: 600;
}
.data-sequence {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  list-style: none;
  padding: 0;
  margin: 0 0 20px;
}
.data-sequence li {
  display: grid;
  gap: 5px;
  min-width: 40px;
  padding: 7px;
  border: 1px solid var(--line);
  border-radius: 5px;
  text-align: center;
}
.data-sequence span {
  font-size: 10px;
  color: var(--muted);
}
.data-sequence strong {
  font-size: 12px;
}
.data-table-scroll {
  overflow-x: auto;
  max-width: 100%;
  margin: 18px 0;
  border: 1px solid var(--line);
  border-radius: 8px;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
  text-align: left;
}
caption {
  text-align: left;
  padding: 12px;
  font-weight: 600;
}
th,
td {
  padding: 9px 12px;
  border-top: 1px solid var(--line);
  white-space: pre-line;
  min-width: 65px;
  overflow-wrap: anywhere;
}
thead th {
  color: var(--muted);
  font-weight: 500;
}
tbody th {
  font-weight: 500;
}
.data-nowrap {
  white-space: nowrap;
  overflow-wrap: normal;
}
.data-empty,
.data-caption {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.8;
}
.data-caption {
  margin: 16px 0 0;
}
.success {
  background: var(--green-pale);
  color: var(--success);
}
.warning {
  background: #fff7e6;
  color: #805818;
}
.danger {
  background: #fcefed;
  color: #a13d36;
}
@media (max-width: 600px) {
  .data-scene {
    padding: 14px;
  }
  th,
  td {
    padding: 8px;
  }
}
</style>

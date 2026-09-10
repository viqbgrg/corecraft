<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, useId } from 'vue'
import type { ExperimentAction, ExperimentDefinition, ExperimentView } from '../types/experiment'
import { createExperiment } from './registry'
import SceneRenderer from './SceneRenderer.vue'
import Icon from '../components/Icon.vue'

const props = defineProps<{ definition: ExperimentDefinition }>()
const emit = defineEmits<{ observe: [view: ExperimentView] }>()
const uid = useId()
const session = createExperiment(props.definition)
const view = shallowRef(session.view())
const expandedLog = ref(false)
const fields = computed(() => view.value.controls.filter((c) => c.kind !== 'button'))
const buttons = computed(() => view.value.controls.filter((c) => c.kind === 'button'))
const observations = computed(() =>
  (expandedLog.value ? view.value.log : view.value.log.slice(-3)).slice().reverse(),
)
function publish() {
  view.value = session.view()
  emit('observe', view.value)
}
function dispatch(action: ExperimentAction) {
  session.dispatch(action)
  publish()
}
function change(type: string, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  const control = view.value.controls.find((c) => c.id === type)
  if (control?.kind === 'number' && target.value !== '' && Number(target.value) === control.value) return
  dispatch({ type, value: target.value })
}
function numberInput(type: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  // Commit complete integer edits immediately, while allowing an empty draft during typing.
  if (value !== '' && Number.isSafeInteger(Number(value))) change(type, event)
}
function reset() {
  session.reset()
  expandedLog.value = false
  publish()
}
onMounted(() => emit('observe', view.value))
</script>

<template>
  <section class="workbench" :aria-label="definition.title">
    <header class="workbench-header">
      <div>
        <span class="workbench-icon"><Icon name="terminal" :size="18" /></span>
        <div>
          <h2>{{ definition.title }}</h2>
          <span class="workbench-subtitle">{{ definition.type.toUpperCase() }} / INTERACTIVE LAB</span>
        </div>
      </div>
      <div class="workbench-header-actions">
        <span class="live-badge"><i class="status-dot" />可交互</span
        ><button class="icon-button" aria-label="重置实验" title="重置实验" @click="reset">
          <Icon name="reset" />
        </button>
      </div>
    </header>
    <div class="workbench-fields" :style="{ '--field-count': Math.min(fields.length, 4) }">
      <div
        v-for="field in fields"
        :key="field.id"
        class="control-field"
        :class="{ 'full-width': field.id === 'url' }"
      >
        <label :for="uid + '-' + field.id">{{ field.label }}</label
        ><select
          v-if="field.kind === 'select'"
          :id="uid + '-' + field.id"
          :value="field.value"
          :disabled="field.disabled"
          @change="change(field.id, $event)"
        >
          <option v-for="option in field.options" :key="option.value" :value="option.value">
            {{ option.label }}
          </option></select
        ><input
          v-else
          :id="uid + '-' + field.id"
          :type="field.kind === 'number' ? 'number' : 'text'"
          :value="field.value"
          :min="field.min"
          :max="field.max"
          :step="field.kind === 'number' ? 1 : undefined"
          :disabled="field.disabled"
          :spellcheck="false"
          autocomplete="off"
          @input="field.kind === 'number' && numberInput(field.id, $event)"
          @change="change(field.id, $event)"
        />
      </div>
    </div>
    <SceneRenderer :scene="view.scene" @action="dispatch" />
    <div class="workbench-actions">
      <button
        v-for="button in buttons"
        :key="button.id"
        class="button"
        :class="{ primary: button.primary }"
        :disabled="button.disabled"
        @click="dispatch({ type: button.id })"
      >
        {{ button.label }}<Icon v-if="button.primary" name="arrow" :size="15" />
      </button>
    </div>
    <div class="metric-grid">
      <div v-for="metric in view.metrics" :key="metric.label" class="metric" :class="metric.tone">
        <span>{{ metric.label }}</span
        ><strong class="mono"
          >{{ metric.value }}<small v-if="metric.unit">{{ metric.unit }}</small></strong
        >
      </div>
    </div>
    <div
      class="experiment-feedback"
      :class="view.status.tone"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <Icon :name="view.status.tone === 'success' ? 'check' : 'lightbulb'" :size="19" />
      <div>
        <strong>{{ view.status.title }}</strong>
        <p>{{ view.status.detail }}</p>
      </div>
    </div>
    <section class="observation-panel" aria-label="实验观察记录">
      <div class="observation-header">
        <span
          ><Icon name="terminal" :size="14" />观察记录
          <small>{{ view.log.length ? String(view.log.at(-1)?.step).padStart(2, '0') : '00' }}</small></span
        ><button
          v-if="view.log.length > 3"
          class="text-button"
          :aria-expanded="expandedLog"
          @click="expandedLog = !expandedLog"
        >
          {{ expandedLog ? '收起记录' : '展开记录'
          }}<Icon :name="expandedLog ? 'close' : 'arrowDown'" :size="13" />
        </button>
      </div>
      <p v-if="!view.log.length" class="empty-log">
        <span class="terminal-prompt">›</span> 做一次操作，让原理发生在眼前。<span class="cursor-block" />
      </p>
      <ol v-else class="observation-list">
        <li v-for="entry in observations" :key="entry.step">
          <span class="observation-step">{{ String(entry.step).padStart(2, '0') }}</span>
          <div>
            <strong :class="entry.tone">{{ entry.label }}</strong>
            <p>{{ entry.detail }}</p>
          </div>
        </li>
      </ol>
    </section>
  </section>
</template>

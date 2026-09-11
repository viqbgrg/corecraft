<script setup lang="ts">
import type { ExperimentAction, ExperimentScene } from '../types/experiment'
import BinarySceneView from './scenes/BinarySceneView.vue'
import CpuSceneView from './scenes/CpuSceneView.vue'
import PipelineSceneView from './scenes/PipelineSceneView.vue'
import BranchPredictionSceneView from './scenes/BranchPredictionSceneView.vue'
import CacheSceneView from './scenes/CacheSceneView.vue'
import ProcessSceneView from './scenes/ProcessSceneView.vue'
import VirtualMemorySceneView from './scenes/VirtualMemorySceneView.vue'
import NetworkSceneView from './scenes/NetworkSceneView.vue'
import TreeSceneView from './scenes/TreeSceneView.vue'
import DataSceneView from './scenes/DataSceneView.vue'
import GraphSceneView from './scenes/GraphSceneView.vue'
defineProps<{ scene: ExperimentScene }>()
const emit = defineEmits<{ action: [action: ExperimentAction] }>()
</script>
<template>
  <div class="scene-container">
    <BinarySceneView
      v-if="scene.kind === 'binary'"
      :scene="scene"
      @action="emit('action', $event)"
    /><CpuSceneView v-else-if="scene.kind === 'cpu'" :scene="scene" />
    <PipelineSceneView v-else-if="scene.kind === 'instruction-pipeline'" :scene="scene" />
    <BranchPredictionSceneView v-else-if="scene.kind === 'branch-prediction'" :scene="scene" />
    <CacheSceneView v-else-if="scene.kind === 'cache'" :scene="scene" /><ProcessSceneView
      v-else-if="scene.kind === 'process'"
      :scene="scene"
    /><VirtualMemorySceneView v-else-if="scene.kind === 'virtual-memory'" :scene="scene" /><NetworkSceneView
      v-else-if="scene.kind === 'network'"
      :scene="scene"
    /><TreeSceneView v-else-if="scene.kind === 'tree'" :scene="scene" />
    <DataSceneView v-else-if="scene.kind === 'data'" :scene="scene" />
    <GraphSceneView v-else :scene="scene" />
  </div>
</template>

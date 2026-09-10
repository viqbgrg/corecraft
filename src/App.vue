<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppLayout from './layouts/AppLayout.vue'
const route = useRoute()
</script>
<template>
  <AppLayout><RouterView :key="route.path" /></AppLayout>
</template>

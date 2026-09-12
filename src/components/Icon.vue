<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 })
const paths: Record<string, string> = {
  cube: 'M12 3 21 8v8l-9 5-9-5V8l9-5Zm0 0v9m-9-4 9 4 9-4m-9 4v9',
  book: 'M3 4h6a4 4 0 0 1 3 1.5A4 4 0 0 1 15 4h6v15h-6a4 4 0 0 0-3 1.5A4 4 0 0 0 9 19H3V4Zm9 2v14',
  terminal: 'm5 7 5 5-5 5m8 0h6M3 3h18v18H3Z',
  flag: 'M5 21V4m0 0c5-5 9 5 14 0v10c-5 5-9-5-14 0',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  back: 'M20 12H4m6-6-6 6 6 6',
  chevron: 'm9 5 7 7-7 7',
  reset: 'M3 10a9 9 0 1 1 1 7M3 4v6h6',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  sparkles: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4',
  github:
    'M9 19c-4 1-4-2-6-2m12 4v-4c0-1 .2-2-1-3 4 0 6-2 6-5 0-1-.5-2-1-3 0-1 0-2-.5-3-1 0-3 1-3 1a11 11 0 0 0-7 0S6.5 3 5.5 3C5 4 5 5 5 6a5 5 0 0 0-1 3c0 3 2 5 6 5-1 1-1 2-1 3v4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z',
  monitor: 'M3 4h18v13H3ZM8 21h8m-4-4v4',
  lightbulb: 'M9 18h6m-5 3h4M8 14c-4-4-1-11 4-11s8 7 4 11c-1 1-1 2-1 2H9s0-1-1-2Z',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',
  link: 'm10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 4a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1',
  external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  chip: 'M7 7h10v10H7ZM9 1v6m6-6v6M9 17v6m6-6v6M1 9h6m-6 6h6m10-6h6m-6 6h6',
  network: 'M9 3h6v6H9ZM2 15h6v6H2Zm14 0h6v6h-6ZM12 9v3M5 15v-3h14v3',
  layers: 'm12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5',
  arrowDown: 'M12 4v16m-6-6 6 6 6-6',
  info: 'M12 11v6m0-10v.1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
}
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.65"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] ?? paths.info" />
  </svg>
</template>

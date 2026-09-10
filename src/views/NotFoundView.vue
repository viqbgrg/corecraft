<script setup lang="ts">
import Icon from '../components/Icon.vue'
</script>
<template>
  <section class="not-found">
    <span class="eyebrow">404 / UNMAPPED ADDRESS</span>
    <h1>这个地址，还没有映射。</h1>
    <p>没有找到这个页面。回到实验台，或看看接下来的学习路线。</p>
    <RouterLink to="/learn/binary" class="button primary">回到第一个实验<Icon name="arrow" /></RouterLink
    ><RouterLink to="/roadmap" class="button">查看路线</RouterLink>
  </section>
</template>

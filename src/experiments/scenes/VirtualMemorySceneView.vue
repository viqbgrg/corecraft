<script setup lang="ts">
import type { VirtualMemoryScene } from '../../types/experiment'
import { hex } from '../core/session'
defineProps<{ scene: VirtualMemoryScene }>()
</script>
<template>
  <div class="vm-scene scene-grid">
    <div class="address-translation">
      <div>
        <span class="panel-label">VIRTUAL ADDRESS</span><strong class="mono">{{ hex(scene.address) }}</strong>
      </div>
      <span>→</span>
      <div class="address-parts">
        <span
          >VPN <b>{{ scene.vpn }}</b></span
        ><span
          >OFFSET <b>{{ scene.offset }}</b></span
        >
      </div>
      <span>→</span>
      <div>
        <span class="panel-label">PHYSICAL ADDRESS</span
        ><strong class="mono">{{ scene.physical === null ? '待转换' : hex(scene.physical) }}</strong>
      </div>
    </div>
    <div class="vm-tables">
      <section>
        <div class="panel-label">TLB<span>2 项 · LRU</span></div>
        <table>
          <thead>
            <tr>
              <th>虚拟页 VPN</th>
              <th>物理帧 PFN</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in scene.tlb" :key="entry.vpn">
              <td>{{ entry.vpn }}</td>
              <td>{{ entry.frame }}</td>
            </tr>
            <tr v-if="!scene.tlb.length">
              <td colspan="2" class="empty-cell">还没有缓存地址映射</td>
            </tr>
          </tbody>
        </table>
        <p class="model-note">VPN 在 TLB 命中，便无需再查页表。</p>
        <div class="translation-formula">
          <span>PAGE SIZE</span><strong>{{ scene.pageSize }} B</strong
          ><small>物理地址 = PFN × {{ scene.pageSize }} + Offset</small>
        </div>
      </section>
      <section>
        <div class="panel-label">
          PAGE TABLE<span>{{ scene.stage }}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>VPN</th>
              <th>Present</th>
              <th>PFN</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="page in scene.pages" :key="page.vpn" :class="{ active: page.active }">
              <td>{{ page.vpn }}</td>
              <td>
                <span :class="page.frame === null ? 'warning-label' : 'success-label'">{{
                  page.frame === null ? '0 · DISK' : '1 · RAM'
                }}</span>
              </td>
              <td>{{ page.frame ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>

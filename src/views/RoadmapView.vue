<script setup lang="ts">
import { useRoute } from 'vue-router'
import { courses } from '../courses'
import { roadmap } from '../data/roadmap'
import { courseForTopic } from '../data/coverage'
import { knowledgePaths } from '../data/concepts'
import ConceptLink from '../components/ConceptLink.vue'
import Icon from '../components/Icon.vue'
const route = useRoute()
const atLevel = (level: number) => courses.filter((c) => c.level === level)
</script>
<template>
  <div class="roadmap-page">
    <div class="breadcrumbs">
      <span>CoreCraft</span><Icon name="chevron" :size="12" /><span>学习路线</span>
    </div>
    <header class="roadmap-heading">
      <span class="eyebrow">ONE CONNECTED LEARNING JOURNEY</span>
      <h1>知识不是孤岛。<br /><span>把它们，一块块连起来。</span></h1>
      <p>从一个比特，到一个分布式系统。<br />每一步都问为什么，每一步都亲手验证。</p>
      <div class="roadmap-stats">
        <div><strong>18</strong><span>知识层级</span></div>
        <div>
          <strong>{{ courses.length.toString().padStart(2, '0') }}</strong
          ><span>已开放互动实验</span>
        </div>
        <div><strong>∞</strong><span>值得追问的为什么</span></div>
      </div>
    </header>
    <div class="roadmap-notice">
      <Icon name="lightbulb" :size="22" />
      <p>
        <strong>从计算机基础，一路连到高级后端。</strong>现在开放 {{ courses.length }} 个可操作实验，覆盖
        Level 0–17 的全部知识主题。点击知识点即可进入对应课程。
      </p>
      <RouterLink to="/learn/modeling" class="button primary"
        >开始探索<Icon name="arrow" :size="15"
      /></RouterLink>
    </div>
    <section class="knowledge-paths">
      <div class="section-heading">
        <span class="eyebrow">FOLLOW THE CONNECTIONS</span><span>两条值得追踪的知识线索</span>
      </div>
      <div v-for="(path, i) in knowledgePaths" :key="i" class="knowledge-path">
        <template v-for="(id, j) in path" :key="id"
          ><Icon v-if="j" name="arrow" :size="13" /><ConceptLink :concept="id"
        /></template>
      </div>
    </section>
    <div class="roadmap-levels">
      <section
        v-for="level in roadmap"
        :id="'level-' + level.level"
        :key="level.level"
        class="roadmap-level"
        :class="{
          available: atLevel(level.level).length,
          highlighted: route.query.level === String(level.level),
        }"
      >
        <div class="level-number">{{ String(level.level).padStart(2, '0') }}</div>
        <div class="level-content">
          <header>
            <div>
              <span class="eyebrow">LEVEL {{ level.level }}</span>
              <h2>{{ level.title }}</h2>
            </div>
            <span class="level-status" :class="{ open: atLevel(level.level).length }"
              ><i class="status-dot" />{{
                atLevel(level.level).length ? atLevel(level.level).length + ' 个实验已开放' : '规划中'
              }}</span
            >
          </header>
          <p>{{ level.summary }}</p>
          <div v-if="atLevel(level.level).length" class="available-courses">
            <RouterLink v-for="course in atLevel(level.level)" :key="course.id" :to="'/learn/' + course.slug"
              ><Icon name="terminal" :size="16" /><span>{{ course.title }}</span
              ><Icon name="arrow" :size="15"
            /></RouterLink>
          </div>
          <details :open="route.query.level === String(level.level)">
            <summary>
              查看知识范围 <span>{{ level.groups.reduce((n, g) => n + g.topics.length, 0) }} 个知识点</span
              ><Icon name="chevron" :size="15" />
            </summary>
            <div v-for="group in level.groups" :key="group.title" class="topic-group">
              <h3>{{ group.title }}</h3>
              <div>
                <template v-for="topic in group.topics" :key="topic">
                  <RouterLink
                    v-if="courseForTopic(level.level, topic)"
                    :to="'/learn/' + courseForTopic(level.level, topic)"
                    class="covered-topic"
                    >{{ topic }}<Icon name="arrow" :size="11"
                  /></RouterLink>
                  <span v-else>{{ topic }}</span>
                </template>
              </div>
            </div>
            <div v-if="level.experiments.length" class="planned-experiments">
              <strong>实验方向</strong>
              <p>{{ level.experiments.join(' · ') }}</p>
            </div>
          </details>
        </div>
      </section>
    </div>
    <div class="roadmap-ending">
      <Icon name="cube" :size="36" />
      <h2>不只是记住答案。<br />建立自己的计算机模型。</h2>
      <a
        href="https://github.com/viqbgrg/corecraft/blob/main/docs/contributing.md"
        target="_blank"
        rel="noopener noreferrer"
        class="button"
        >一起构建 CoreCraft<Icon name="external" :size="15"
      /></a>
    </div>
  </div>
</template>

import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  "id": "dns",
  "slug": "dns",
  "title": "DNS 如何找到地址",
  "englishTitle": "Finding the Right Address",
  "level": 4,
  "category": "网络与协议",
  "duration": 12,
  "description": "从一个域名出发，沿着转介与缓存一步步找到答案。",
  "question": "根 DNS 不知道所有 IP，为什么仍然能帮你找到目标？",
  "objectives": [
    "区分递归查询与迭代转介",
    "观察 Root、TLD、Authoritative 各自的职责",
    "比较冷查询、缓存命中与 TTL 到期"
  ],
  "prerequisites": [
    "cache"
  ],
  "nextConcepts": [
    "http",
    "tls"
  ],
  "concepts": [
    {
      "id": "dns",
      "title": "DNS 分层委派",
      "content": "根负责顶级域转介，顶级域负责下级权威服务器转介，权威服务器提供记录。",
      "why": "让每个域管理自己的名字，避免一个中心存储全部域名记录。",
      "relatedConcepts": [
        "dns-cache",
        "http"
      ]
    },
    {
      "id": "dns-cache",
      "title": "DNS 缓存与 TTL",
      "content": "递归解析器在 TTL 有效期间复用已有结果。不存在的名称也可以按负缓存规则暂存。",
      "why": "降低查询延迟与上游负载，同时用有限有效期约束陈旧记录。",
      "relatedConcepts": [
        "cache",
        "http"
      ]
    }
  ],
  "challenge": {
    "question": "对同一域名的第二次查询没有联系根服务器，最合理的原因是什么？",
    "options": [
      {
        "id": "a",
        "text": "有效缓存已经有答案，不必重新查询上游。"
      },
      {
        "id": "b",
        "text": "DNS 每个域名只允许查询一次。"
      },
      {
        "id": "c",
        "text": "根服务器永久保存了这个浏览器的连接。"
      }
    ],
    "answer": "a",
    "explanation": "缓存可以直接返回仍在 TTL 内的记录。TTL 到期或缓存清空之后，模型才重新执行上游查询。",
    "hint": "完成冷查询后点击“再查一次”，然后将时钟推进 60 s 再比较。"
  },
  "experiments": [
    {
      "id": "dns-resolution-lab",
      "type": "dns",
      "title": "DNS 查询实验台",
      "description": "手动执行请求与转介，观察缓存怎样改变路径。",
      "question": "第二次查询，为什么没有再访问 Root？",
      "config": {}
    }
  ],
  content,
} satisfies Course

import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  "id": "virtual-memory",
  "slug": "virtual-memory",
  "title": "虚拟内存与地址转换",
  "englishTitle": "An Address, Translated",
  "level": 3,
  "category": "操作系统",
  "duration": 16,
  "description": "拆开一个地址，穿过 TLB 和页表，找到数据真正的位置。",
  "question": "两个进程使用相同的地址，为什么不会读到同一份数据？",
  "objectives": [
    "把虚拟地址拆为页号与页内偏移",
    "区分 TLB Miss 和 Page Fault",
    "完成一次缺页处理与访问重试"
  ],
  "prerequisites": [
    "memory",
    "process",
    "cache"
  ],
  "nextConcepts": [
    "page-cache",
    "buffer-pool"
  ],
  "concepts": [
    {
      "id": "virtual-memory",
      "title": "虚拟内存",
      "content": "程序使用虚拟地址，由每个进程自己的映射转换到物理地址。",
      "why": "为进程提供隔离和稳定的地址视图，同时让物理内存可以灵活分配。",
      "relatedConcepts": [
        "page",
        "process"
      ]
    },
    {
      "id": "page",
      "title": "页与页表",
      "content": "虚拟页映射到物理帧，页内偏移保持不变。页表记录映射与驻留状态。",
      "why": "以固定大小的页管理映射，降低连续大块分配和搬迁的困难。",
      "relatedConcepts": [
        "tlb",
        "page-fault"
      ]
    },
    {
      "id": "tlb",
      "title": "TLB",
      "content": "缓存近期使用的地址转换结果，而不是缓存程序数据。",
      "why": "否则每次数据访问之前都需要额外查询页表。",
      "relatedConcepts": [
        "cache",
        "page"
      ]
    },
    {
      "id": "page-fault",
      "title": "Page Fault",
      "content": "本实验中指合法虚拟页暂未驻留，需要 OS 载入后重试。",
      "why": "允许虚拟地址空间中的页按需进入有限的物理内存。真实缺页异常也可能涉及权限或非法映射。",
      "relatedConcepts": [
        "virtual-memory",
        "page-cache"
      ]
    }
  ],
  "challenge": {
    "question": "清空 TLB 后访问一个仍在 RAM 中的页，会发生什么？",
    "options": [
      {
        "id": "a",
        "text": "必定 Page Fault，需要从磁盘加载。"
      },
      {
        "id": "b",
        "text": "这个虚拟地址永久失效。"
      },
      {
        "id": "c",
        "text": "先 TLB Miss，再查页表得到映射并回填 TLB。"
      }
    ],
    "answer": "c",
    "explanation": "TLB 是映射缓存，不是页表本身。条目不在 TLB 中，不代表物理页面不在 RAM。",
    "hint": "先访问 0x012C 并查询页表，再清空 TLB，用同一地址重新访问。"
  },
  "experiments": [
    {
      "id": "virtual-address-lab",
      "type": "virtual-memory",
      "title": "地址转换实验台",
      "description": "跟踪 VPN、Offset、PFN 与地址映射缓存。",
      "question": "TLB 未命中，一定要访问磁盘吗？",
      "config": {}
    }
  ],
  content,
} satisfies Course

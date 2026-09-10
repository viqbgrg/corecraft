import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  "id": "tcp-close",
  "slug": "tcp-close",
  "title": "TCP 四次挥手",
  "englishTitle": "Closing Both Directions",
  "level": 4,
  "category": "网络与协议",
  "duration": 15,
  "description": "关闭一条连接之前，先看清两个独立的数据方向。",
  "question": "为什么“收到你的 FIN”，不代表“我也没有数据要发了”？",
  "objectives": [
    "观察 FIN_WAIT、CLOSE_WAIT、LAST_ACK",
    "在半关闭期间继续发送数据",
    "理解 TIME_WAIT 与最后 ACK 的关系"
  ],
  "prerequisites": [
    "tcp",
    "sequence"
  ],
  "nextConcepts": [
    "http",
    "socket"
  ],
  "concepts": [
    {
      "id": "tcp-close",
      "title": "TCP 半关闭",
      "content": "一端发送 FIN 只表示它不再发送数据，仍可以接收另一方向的数据。",
      "why": "请求方结束发送时，响应方可能还有待发送内容。",
      "relatedConcepts": [
        "tcp",
        "time-wait"
      ]
    },
    {
      "id": "time-wait",
      "title": "TIME_WAIT",
      "content": "典型主动关闭端在收到对方 FIN 并回复 ACK 后等待 2 MSL。",
      "why": "还能确认重传的 FIN，并给旧报文足够时间在网络中消失。",
      "relatedConcepts": [
        "retransmission",
        "socket"
      ]
    }
  ],
  "challenge": {
    "question": "Server 已确认 Client 的 FIN，仍处于 CLOSE_WAIT。它能否继续发送数据？",
    "options": [
      {
        "id": "a",
        "text": "不能，FIN 代表两个方向同时关闭。"
      },
      {
        "id": "b",
        "text": "可以，Client 只关闭了自己的发送方向。"
      },
      {
        "id": "c",
        "text": "必须重新三次握手后才能发送。"
      }
    ],
    "answer": "b",
    "explanation": "此时 Client 在 FIN_WAIT_2 等待对方 FIN，仍可接收 Server 的剩余数据。Server 应用完成发送后才关闭自己的方向。",
    "hint": "按顺序点击第一、第二步，再尝试“Server 发送剩余数据”。"
  },
  "experiments": [
    {
      "id": "tcp-close-lab",
      "type": "tcp-close",
      "title": "TCP 关闭实验台",
      "description": "让两个方向分别结束，再观察 TIME_WAIT。",
      "question": "Client 发出 FIN 后，Server 还能发送数据吗？",
      "config": {}
    }
  ],
  content,
} satisfies Course

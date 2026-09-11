import { expect, test } from '@playwright/test'
import { click, fill, finishCourse, metric, openCourse, select } from './course-helpers'
test('file streams compare actual bytes and restore data across flush, force and power loss', async ({
  page,
}) => {
  await openCourse(page, 'java-file-io')
  await click(page, '复制直到 read 返回 -1')
  await click(page, '对比有缓冲与无缓冲读取')
  await expect(metric(page, 'read 系统调用次数')).toHaveText('4')
  await click(page, 'force · 持久化内核文件页')
  await click(page, 'flush · 清空输出流缓冲')
  await click(page, 'force · 持久化内核文件页')
  await click(page, '模拟断电并读取稳定文件')
  await expect(metric(page, '恢复后的文本')).toContainText('A中🙂B')
  await finishCourse(page, /force 只能持久化文件层已接收的数据/)
})
test('NIO retains partial frames and selected keys and handles short nonblocking writes', async ({
  page,
}) => {
  await openCourse(page, 'nio-selector')
  for (const name of [
    '注册非阻塞 Channel',
    '注入到达字节',
    'Selector.select · 收集就绪',
    'Selector.select · 收集就绪',
    '移除当前 selected key',
    'Channel.read · 接收字节',
    'Buffer.flip · 转为解析',
    '解析完整长度帧',
    'Buffer.compact · 保留半包',
  ])
    await click(page, name)
  await expect(metric(page, '完整帧数')).toHaveText('0')
  await fill(page, 'packet', '66')
  for (const name of [
    '注入到达字节',
    'Channel.read · 接收字节',
    'Buffer.flip · 转为解析',
    '解析完整长度帧',
    'Buffer.compact · 保留半包',
    '切换 OP_WRITE 兴趣',
    'Selector.select · 收集就绪',
    'Channel.write · 发送部分响应',
    '对端释放发送空间',
    'Channel.write · 发送部分响应',
    '切换 OP_WRITE 兴趣',
  ])
    await click(page, name)
  await expect(metric(page, '完整帧数')).toHaveText('1')
  await finishCourse(page, /保留长度头和已有载荷/)
})
test('Netty offload keeps the event loop available, retains buffers and applies write backpressure', async ({
  page,
}) => {
  await openCourse(page, 'netty-reactor')
  await click(page, '提交长度帧请求')
  await select(page, 'selected', 'C2')
  await fill(page, 'text', 'ok')
  await fill(page, 'cost', '1')
  await click(page, '提交长度帧请求')
  await click(page, '运行到当前事件与业务完成')
  await expect(page.locator('[data-table="reactor-completed"] tbody tr').first()).toContainText('C2')
  await expect(metric(page, '释放的 ByteBuf')).toHaveText('2')
  await expect(metric(page, 'EventLoop 被业务占用时隙')).toHaveText('0')
  await click(page, '下游接纳所有待写响应')
  await finishCourse(page, /保留必要引用，任务完成后配对释放/)
})

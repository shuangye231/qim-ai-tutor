import type { Message, Session } from './types'

export const starterMessages: Message[] = [
  {
    id: 'starter-user',
    role: 'user',
    content: 'Scratch 里的“广播消息”有什么用？能举例说明吗？',
    createdAt: Date.now() - 60_000,
  },
  {
    id: 'starter-assistant',
    role: 'assistant',
    content: '广播消息就像舞台上的“小喇叭”：一个角色发出通知，其他角色听到后就能同时行动。比如玩家碰到终点时广播“胜利”，计时器停止、庆祝角色出现、背景音乐切换。',
    createdAt: Date.now(),
  },
]

export const defaultSessions: Session[] = [
  {
    id: 'scratch-broadcast',
    courseId: 'scratch',
    title: 'Scratch 广播消息',
    messages: starterMessages,
    updatedAt: Date.now(),
  },
  { id: 'python-loop', courseId: 'python', title: 'Python 循环入门', messages: [], updatedAt: Date.now() - 86_400_000 },
  { id: 'cpp-condition', courseId: 'cpp', title: 'C++ 条件判断练习', messages: [], updatedAt: Date.now() - 172_800_000 },
  { id: 'scratch-game-plan', courseId: 'scratch', title: '小游戏创作计划', messages: [], updatedAt: Date.now() - 259_200_000 },
]

export const followUps = ['继续追问', '举例说明', '对比表格', '应用场景']

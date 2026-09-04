import type { OjProblem, OjLanguage, OjDifficulty } from './ojProblems'

type Builder = (index: number, language: OjLanguage) => Omit<OjProblem, 'id' | 'code' | 'language' | 'title' | 'difficulty' | 'category' | 'acceptance' | 'solved' | 'points'> & { title: string }

const source = { name: '启码原创题库', license: '原创', url: '' }
const difficulties: OjDifficulty[] = ['入门', '基础', '进阶', '挑战']
const categories = ['基础语法', '分支与循环', '数组与字符串', '数学与枚举', '排序与搜索', '动态规划']

const pyBuilders: Builder[] = [
  () => ({ title: '森林加法器', description: '输入两个整数，输出它们的和。', input: '一行输入两个整数 a、b。', output: '输出 a+b。', examples: [{ input: '7 5', output: '12' }], starterCode: "a, b = map(int, input().split())\nprint(a + b)", tags: ['输入输出', '运算'] }),
  () => ({ title: '树屋温差', description: '输入最高温度和最低温度，输出温差。', input: '一行输入两个整数 high、low。', output: '输出 high-low。', examples: [{ input: '31 18', output: '13' }], starterCode: "high, low = map(int, input().split())\nprint(high - low)", tags: ['运算', '变量'] }),
  () => ({ title: '果园装箱', description: '每箱装 6 个苹果，输入苹果总数，输出最多装满的箱数和剩余数量。', input: '输入非负整数 n。', output: '一行输出箱数和剩余数量。', examples: [{ input: '20', output: '3 2' }], starterCode: "n = int(input())\nprint(n // 6, n % 6)", tags: ['整除', '取余'] }),
  () => ({ title: '奇偶统计', description: '输入 n 个整数，统计其中偶数和奇数的数量。', input: '第一行 n，第二行 n 个整数。', output: '输出偶数个数和奇数个数。', examples: [{ input: '5\n2 7 4 9 6', output: '3 2' }], starterCode: "n = int(input())\na = list(map(int, input().split()))[:n]\neven = sum(x % 2 == 0 for x in a)\nprint(even, n - even)", tags: ['列表', '统计'] }),
  () => ({ title: '探险队最高分', description: '输入 n 个分数，输出最高分和最低分。', input: '第一行 n，第二行 n 个整数。', output: '输出最高分和最低分。', examples: [{ input: '5\n78 92 65 88 71', output: '92 65' }], starterCode: "n = int(input())\na = list(map(int, input().split()))[:n]\nprint(max(a), min(a))", tags: ['列表', '遍历'] }),
  () => ({ title: '成绩平均线', description: '输入 n 个整数成绩，输出整数平均值（向下取整）。', input: '第一行 n，第二行 n 个整数。', output: '输出平均值的整数部分。', examples: [{ input: '4\n80 75 91 86', output: '83' }], starterCode: "n = int(input())\na = list(map(int, input().split()))[:n]\nprint(sum(a) // n)", tags: ['列表', '平均值'] }),
  () => ({ title: '字母反转', description: '输入一个不含空格的单词，输出倒序结果。', input: '输入一行英文单词。', output: '输出倒序后的单词。', examples: [{ input: 'forest', output: 'tserof' }], starterCode: "print(input().strip()[::-1])", tags: ['字符串', '切片'] }),
  () => ({ title: '回文树洞', description: '判断输入字符串是否为回文串。', input: '输入一行不含空格的字符串。', output: '回文输出 Yes，否则输出 No。', examples: [{ input: 'level', output: 'Yes' }], starterCode: "s = input().strip()\nprint('Yes' if s == s[::-1] else 'No')", tags: ['字符串', '回文'] }),
  () => ({ title: '元音收集器', description: '统计英文字符串中元音字母的数量，忽略大小写。', input: '输入一行英文字符串。', output: '输出元音总数。', examples: [{ input: 'Code Forest', output: '4' }], starterCode: "s = input().lower()\nprint(sum(c in 'aeiou' for c in s))", tags: ['字符串', '计数'] }),
  () => ({ title: '数字各位和', description: '输入一个非负整数，输出各位数字之和。', input: '输入非负整数 n。', output: '输出各位数字之和。', examples: [{ input: '20248', output: '16' }], starterCode: "print(sum(map(int, input().strip())))", tags: ['数位', '循环'] }),
  () => ({ title: '数字各位积', description: '输入一个正整数，输出各位数字的乘积。', input: '输入正整数 n。', output: '输出各位数字之积。', examples: [{ input: '2034', output: '0' }], starterCode: "answer = 1\nfor c in input().strip(): answer *= int(c)\nprint(answer)", tags: ['数位', '累乘'] }),
  () => ({ title: '质数守卫', description: '判断一个正整数是否为质数。', input: '输入正整数 n。', output: '质数输出 Yes，否则输出 No。', examples: [{ input: '29', output: 'Yes' }], starterCode: "n = int(input())\nok = n >= 2 and all(n % i for i in range(2, int(n ** 0.5) + 1))\nprint('Yes' if ok else 'No')", tags: ['质数', '判断'] }),
  () => ({ title: '最大公约数', description: '输入两个正整数，输出它们的最大公约数。', input: '一行输入 a、b。', output: '输出最大公约数。', examples: [{ input: '84 30', output: '6' }], starterCode: "import math\na, b = map(int, input().split())\nprint(math.gcd(a, b))", tags: ['数学', '函数'] }),
  () => ({ title: '最小公倍数', description: '输入两个正整数，输出它们的最小公倍数。', input: '一行输入 a、b。', output: '输出最小公倍数。', examples: [{ input: '12 18', output: '36' }], starterCode: "import math\na, b = map(int, input().split())\nprint(a * b // math.gcd(a, b))", tags: ['数学', '整除'] }),
  () => ({ title: '斐波那契探路', description: '输出斐波那契数列第 n 项，规定 F1=1、F2=1。', input: '输入 1≤n≤30。', output: '输出 Fn。', examples: [{ input: '8', output: '21' }], starterCode: "n = int(input())\na, b = 1, 1\nfor _ in range(n - 1): a, b = b, a + b\nprint(a)", tags: ['递推', '循环'] }),
  () => ({ title: '阶乘宝箱', description: '输入 n，输出 n!。', input: '输入 0≤n≤12。', output: '输出 n!。', examples: [{ input: '6', output: '720' }], starterCode: "n = int(input())\nanswer = 1\nfor i in range(2, n + 1): answer *= i\nprint(answer)", tags: ['循环', '累乘'] }),
  () => ({ title: '三角数字塔', description: '输入 n，输出 1 到 n 的总和。', input: '输入正整数 n。', output: '输出总和。', examples: [{ input: '100', output: '5050' }], starterCode: "n = int(input())\nprint(n * (n + 1) // 2)", tags: ['公式', '数学'] }),
  () => ({ title: 'Fizz 森林', description: '输出 1 到 n，3 的倍数输出 Fizz，5 的倍数输出 Buzz，同时满足输出 FizzBuzz。', input: '输入正整数 n。', output: '每个结果占一行。', examples: [{ input: '5', output: '1\n2\nFizz\n4\nBuzz' }], starterCode: "n = int(input())\nfor i in range(1, n + 1):\n    print('FizzBuzz' if i % 15 == 0 else 'Fizz' if i % 3 == 0 else 'Buzz' if i % 5 == 0 else i)", tags: ['循环', '条件'] }),
  () => ({ title: '去重后的足迹', description: '输入 n 个整数，按首次出现顺序输出不重复的数字。', input: '第一行 n，第二行 n 个整数。', output: '输出去重后的数字，空格分隔。', examples: [{ input: '7\n2 3 2 5 3 5 7', output: '2 3 5 7' }], starterCode: "n = int(input())\nseen = []\nfor x in map(int, input().split()):\n    if x not in seen: seen.append(x)\nprint(*seen[:n])", tags: ['列表', '去重'] }),
  () => ({ title: '前缀能量', description: '给出 n 个能量值，输出每个位置的前缀和。', input: '第一行 n，第二行 n 个整数。', output: '输出前缀和序列。', examples: [{ input: '4\n2 4 1 3', output: '2 6 7 10' }], starterCode: "n = int(input())\ntotal = 0\nout = []\nfor x in map(int, input().split()):\n    total += x; out.append(total)\nprint(*out[:n])", tags: ['前缀和', '数组'] }),
  () => ({ title: '区间寻宝', description: '输入数组和多个查询，输出每个闭区间的元素和。', input: '第一行 n、q；第二行 n 个数；随后 q 行 l、r（从 1 开始）。', output: '每个查询输出一行区间和。', examples: [{ input: '5 2\n1 2 3 4 5\n1 3\n2 5', output: '6\n14' }], starterCode: "n, q = map(int, input().split())\na = list(map(int, input().split()))[:n]\np = [0]\nfor x in a: p.append(p[-1] + x)\nfor _ in range(q):\n    l, r = map(int, input().split()); print(p[r] - p[l - 1])", tags: ['前缀和', '查询'] }),
]

const cppBuilders: Builder[] = pyBuilders.map((builder) => (index) => {
  const item = builder(index, 'python')
  const code = item.starterCode
    .replace(/print\((.*)\)/g, 'cout << $1;')
    .replace(/input\(\)\.strip\(\)/g, 's')
  return {
    ...item,
    title: item.title.replace('森林', '营地').replace('树屋', '木屋'),
    starterCode: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // ${item.title}\n    // 请使用标准输入读取数据，并将答案输出到标准输出。\n    return 0;\n}`,
    description: `${item.description} 本题使用 C++17 完成。`,
    tags: [...item.tags, 'C++17'],
    examples: item.examples,
    input: item.input,
    output: item.output,
    source,
  }
})

const scratchTitles = [
  '森林小猫自动散步', '星星收集计分器', '迷宫碰壁退回', '雨天躲雨小游戏', '水果接住挑战', '气球上升动画',
  '小狗追逐鼠标', '四季背景切换', '倒计时答题器', '弹球反弹舞台', '太空飞船躲陨石', '海底寻宝记',
  '农场浇水提醒', '角色对话剧场', '随机烟花秀', '节拍器小乐队', '交通灯模拟器', '温度小管家',
  '排行榜计分板', '分身闯关挑战', '键盘控制赛车', '点击泡泡得分', '迷你计算器', '密码宝箱',
  '滚动字幕舞台', '克隆小鱼群', '颜色分类游戏', '跟随路线小车', '跳跃躲障碍', '植物成长日记',
  '垃圾分类挑战', '天气预报动画', '数学口算闯关', '小小打字员', '传送门迷宫', '故事分支选择',
]

const scratchProblems: OjProblem[] = scratchTitles.map((title, index) => ({
  id: `sc-p${String(index + 1).padStart(3, '0')}`,
  code: `S${String(1005 + index).padStart(4, '0')}`,
  title,
  type: 'programming',
  language: 'scratch',
  difficulty: difficulties[index % difficulties.length],
  category: ['事件与动作', '循环与图形', '变量与数据', '条件与侦测'][index % 4],
  tags: ['Scratch 3', '作品提交', index % 2 ? '动画' : '交互'],
  acceptance: 0,
  solved: 0,
  points: 20 + (index % 3) * 5,
  description: `请在 Scratch 3 中完成“${title}”：搭建可运行的互动作品，至少包含一个事件、一个变量或计分反馈，并让舞台能清楚展示任务结果。作品完成后点击“提交作品”，由老师进行人工评分。`,
  input: '无需标准输入，在 Scratch 舞台中完成交互。',
  output: '提交一个可运行的 Scratch 作品（.sb3）。',
  examples: [{ input: '点击绿旗运行作品', output: '舞台出现可观察的动画或交互结果' }],
  test_cases: [],
  starterCode: '',
  source,
}))

function buildScratchBatch(count: number, start: number): OjProblem[] {
  return Array.from({ length: count }, (_, offset) => {
    const index = start + offset
    const title = scratchTitles[offset % scratchTitles.length]
    return {
      id: `sc-p${String(index + 1).padStart(3, '0')}`,
      code: `S${String(1100 + index).padStart(4, '0')}`,
      title: `${title} ${Math.floor(offset / scratchTitles.length) + 1}`,
      type: 'programming',
      language: 'scratch',
      difficulty: difficulties[index % difficulties.length],
      category: ['事件与动作', '循环与图形', '变量与数据', '条件与侦测'][index % 4],
      tags: ['Scratch 3', '作品提交', index % 2 ? '动画' : '交互'],
      acceptance: 0,
      solved: 0,
      points: 20 + (index % 3) * 5,
      description: `请在 Scratch 3 中完成“${title}”：搭建可运行的互动作品，至少包含一个事件、一个变量或计分反馈，并让舞台能清楚展示任务结果。作品完成后点击“提交作品”，由老师进行人工评分。`,
      input: '无需标准输入，在 Scratch 舞台中完成交互。',
      output: '提交一个可运行的 Scratch 作品（.sb3）。',
      examples: [{ input: '点击绿旗运行作品', output: '舞台出现可观察的动画或交互结果' }],
      test_cases: [],
      starterCode: '',
      source,
    }
  })
}

function buildBatch(language: OjLanguage, count: number, start: number, builders: Builder[]): OjProblem[] {
  return Array.from({ length: count }, (_, offset) => {
    const index = start + offset
    const item = builders[offset % builders.length](index, language)
    return {
      ...item,
      id: `${language === 'python' ? 'py' : 'cpp'}-p${String(index + 1).padStart(3, '0')}`,
      code: `${language === 'python' ? 'P' : 'C'}${String(1100 + index).padStart(4, '0')}`,
      title: `${item.title} ${Math.floor(offset / builders.length) + 1}`,
      language,
      difficulty: difficulties[index % difficulties.length],
      category: categories[index % categories.length],
      acceptance: 55 + (index * 7) % 41,
      solved: 20 + (index * 19) % 260,
      points: 10 + (index % 4) * 5,
      source,
      test_cases: item.examples,
    }
  })
}

export const generatedOjProblems: OjProblem[] = [
  ...buildBatch('python', 480, 0, pyBuilders),
  ...buildBatch('cpp', 480, 0, cppBuilders),
  ...scratchProblems,
  ...buildScratchBatch(80, scratchProblems.length),
]

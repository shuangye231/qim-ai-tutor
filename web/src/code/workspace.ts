import type { CodeContext, CourseId } from '../types'

const starters: Record<CourseId, string> = {
  scratch: '',
  python: `name = input("你叫什么名字？")
print(f"你好，{name}！")
`,
  cpp: `#include <iostream>
#include <string>
using namespace std;

int main() {
    string name;
    cin >> name;
    cout << "你好，" << name << "！" << endl;
    return 0;
}
`,
}

export const codeWorkspaceKey = (username: string, courseId: CourseId, sessionId: string) =>
  `qima-code-workspace:${username}:${courseId}:${sessionId}`

export const emptyCodeContext = (courseId: CourseId): CodeContext => ({
  courseId,
  language: courseId,
  source: starters[courseId],
  stdin: courseId === 'scratch' ? '' : '小码\n',
  stdout: '',
  stderr: '',
  status: 'idle',
  updatedAt: Date.now(),
})

export function readCodeContext(username: string, courseId: CourseId, sessionId: string): CodeContext {
  try {
    const value = JSON.parse(localStorage.getItem(codeWorkspaceKey(username, courseId, sessionId)) || 'null')
    return value?.courseId === courseId ? { ...emptyCodeContext(courseId), ...value } : emptyCodeContext(courseId)
  } catch {
    return emptyCodeContext(courseId)
  }
}

export function saveCodeContext(username: string, sessionId: string, context: CodeContext) {
  localStorage.setItem(codeWorkspaceKey(username, context.courseId, sessionId), JSON.stringify({ ...context, updatedAt: Date.now() }))
}

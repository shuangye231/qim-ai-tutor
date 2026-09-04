interface PyodideRuntime {
  runPythonAsync: (code: string) => Promise<unknown>
}

declare global {
  interface Window {
    loadPyodide?: (options: { indexURL: string }) => Promise<PyodideRuntime>
  }
}

const PYODIDE_VERSION = '0.27.7'
const PYODIDE_ROOT = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`
let runtimePromise: Promise<PyodideRuntime> | null = null

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string) {
  let timer = 0
  const timeout = new Promise<T>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), milliseconds)
  })
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer))
}

function loadScript() {
  if (window.loadPyodide) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-qima-pyodide]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Python 运行环境加载失败，请检查网络后重试')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = `${PYODIDE_ROOT}pyodide.js`
    script.dataset.qimaPyodide = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Python 运行环境加载失败，请检查网络后重试'))
    document.head.appendChild(script)
  })
}

async function getRuntime() {
  if (!runtimePromise) {
    runtimePromise = loadScript().then(() => {
      if (!window.loadPyodide) throw new Error('Python 运行环境初始化失败')
      return window.loadPyodide({ indexURL: PYODIDE_ROOT })
    })
  }
  return runtimePromise
}

export async function runPython(source: string, stdin: string) {
  let runtime: PyodideRuntime
  try {
    runtime = await withTimeout(getRuntime(), 30000, 'Python 运行环境加载超时，请检查网络后重试')
  } catch (error) {
    runtimePromise = null
    throw error
  }
  const wrapped = `
import io, json, sys, traceback
_qima_stdout = io.StringIO()
_qima_stderr = io.StringIO()
sys.stdin = io.StringIO(${JSON.stringify(stdin)})
sys.stdout = _qima_stdout
sys.stderr = _qima_stderr
try:
    exec(compile(${JSON.stringify(source)}, "<student.py>", "exec"), {})
except BaseException:
    traceback.print_exc(file=_qima_stderr)
json.dumps({"stdout": _qima_stdout.getvalue(), "stderr": _qima_stderr.getvalue()}, ensure_ascii=False)
`
  const value = String(await withTimeout(runtime.runPythonAsync(wrapped), 10000, '代码运行超时，请检查是否存在无限循环'))
  return JSON.parse(value) as { stdout: string; stderr: string }
}

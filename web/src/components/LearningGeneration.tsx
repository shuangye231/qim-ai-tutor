import { Sparkles } from 'lucide-react'

interface LearningGenerationProps {
  kind: '路线' | '笔记' | '练习'
}

export function LearningGeneration({ kind }: LearningGenerationProps) {
  return (
    <div className="learning-generation" role="status" aria-live="polite">
      <span className="learning-generation-icon" aria-hidden="true"><Sparkles size={17} /></span>
      <span>
        <strong>正在根据本次 AI 回答生成{kind}</strong>
        <small>提取已有内容，不会额外消耗 Token</small>
      </span>
      <span className="learning-generation-bars" aria-hidden="true"><i /><i /><i /></span>
    </div>
  )
}

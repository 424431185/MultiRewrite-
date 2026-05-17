import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  GraduationCap,
  PenLine,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import './styles.css';

type RewriteMode = 'academic' | 'natural' | 'conservative';
type AgentKey = 'summary' | 'bridge' | 'chart' | 'review' | 'rewrite';

type AgentResult = {
  name: string;
  content: string;
  status: 'waiting' | 'running' | 'done';
  progress: string[];
};

type ParagraphResult = {
  original: string;
  rewritten: string;
  status: 'waiting' | 'streaming' | 'done';
  agents: Record<AgentKey, AgentResult>;
  round: number;
  accepted: boolean;
  sectionId: string;
};

type DocumentSection = {
  id: string;
  title: string;
  summary: string;
  paragraphStart: number;
  paragraphEnd: number;
};

type DocumentStructure = {
  documentType: 'fragment' | 'full-paper';
  sections: DocumentSection[];
  paragraphSections: string[];
};

type StreamEvent = {
  event: string;
  data: string;
};

const sampleText = `人工智能生成内容在学术写作中的应用日益广泛，但其表达模式可能导致文本重复率升高，并被 AIGC 检测工具识别。因此，论文修改应在保持原意与论证逻辑的基础上，优化句式结构、术语衔接和段落节奏。

在实际修改过程中，作者需要兼顾文本原创性、学术准确性和表达自然度。若仅进行同义词替换，可能无法真正降低重复风险，也容易破坏原有论证的连续性。`;

const modeLabels: Record<RewriteMode, string> = {
  academic: '学术规范',
  natural: '自然表达',
  conservative: '保守改写',
};

const agentLabels: Record<AgentKey, string> = {
  summary: '总结与逻辑',
  bridge: '上下文衔接',
  chart: '图表检测',
  review: '终审约束',
  rewrite: '最终改写',
};

function createEmptyAgents(): Record<AgentKey, AgentResult> {
  return {
    summary: { name: '段落总结与逻辑分析员', content: '', status: 'waiting', progress: [] },
    bridge: { name: '上下文衔接员', content: '', status: 'waiting', progress: [] },
    chart: { name: '图表需求检测员', content: '', status: 'waiting', progress: [] },
    review: { name: '终审员', content: '', status: 'waiting', progress: [] },
    rewrite: { name: '降重降 AIGC 改写员', content: '', status: 'waiting', progress: [] },
  };
}

function parseSseChunk(chunk: string): StreamEvent[] {
  return chunk
    .split('\n\n')
    .map((block) => {
      const event = block.match(/^event:\s*(.+)$/m)?.[1];
      const data = block.match(/^data:\s*(.+)$/m)?.[1];

      if (!event || !data) {
        return null;
      }

      return { event, data };
    })
    .filter((item): item is StreamEvent => Boolean(item));
}

function App() {
  const [input, setInput] = useState(sampleText);
  const [mode, setMode] = useState<RewriteMode>('academic');
  const [strength, setStrength] = useState(62);
  const [results, setResults] = useState<ParagraphResult[]>([]);
  const [structure, setStructure] = useState<DocumentStructure | null>(null);
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  const wordCount = input.trim() ? input.trim().length : 0;
  const estimatedRepeat = Math.max(8, 42 - Math.round(strength / 4));
  const estimatedAigc = Math.max(12, 58 - Math.round(strength / 3));
  const doneCount = results.filter((item) => item.status === 'done').length;
  const resultText = useMemo(() => results.map((item) => item.rewritten).join('\n\n'), [results]);

  async function runRewriteRequest(text: string, targetIndex?: number) {
    if (!text.trim() || isStreaming) {
      return;
    }

    setError('');
    setIsStreaming(true);
    if (typeof targetIndex !== 'number') {
      setStructure(null);
    }

    try {
      const response = await fetch('/api/rewrite-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, mode, strength }),
      });

      if (!response.ok || !response.body) {
        throw new Error('无法连接后端降重服务。');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const boundary = buffer.lastIndexOf('\n\n');

        if (boundary === -1) {
          continue;
        }

        const ready = buffer.slice(0, boundary + 2);
        buffer = buffer.slice(boundary + 2);

        for (const item of parseSseChunk(ready)) {
          const payload = JSON.parse(item.data);
          const resolvedIndex = typeof targetIndex === 'number' ? targetIndex : payload.index;

          if (item.event === 'start') {
            if (typeof targetIndex !== 'number') {
              setStructure(payload.structure);
              setIsOutlineCollapsed(false);
              setExpandedSections({});
              setResults(
                payload.paragraphs.map((paragraph: string, paragraphIndex: number) => ({
                  original: paragraph,
                  rewritten: '',
                  status: 'waiting',
                  agents: createEmptyAgents(),
                  round: 1,
                  accepted: false,
                  sectionId: payload.structure?.paragraphSections?.[paragraphIndex] || 'section-1',
                })),
              );
            }
          }

          if (item.event === 'paragraph-start') {
            setResults((current) =>
              current.map((paragraph, index) =>
                index === resolvedIndex
                  ? {
                      ...paragraph,
                      original: typeof targetIndex === 'number' ? text : paragraph.original,
                      rewritten: '',
                      status: 'streaming',
                      agents: createEmptyAgents(),
                      round: typeof targetIndex === 'number' ? paragraph.round + 1 : paragraph.round,
                      accepted: false,
                    }
                  : paragraph,
              ),
            );
          }

          if (item.event === 'delta') {
            setResults((current) =>
              current.map((paragraph, index) =>
                index === resolvedIndex
                  ? {
                      ...paragraph,
                      rewritten: paragraph.rewritten + payload.content,
                      agents: {
                        ...paragraph.agents,
                        rewrite: {
                          ...paragraph.agents.rewrite,
                          status: 'running',
                          content: paragraph.agents.rewrite.content + payload.content,
                        },
                      },
                    }
                  : paragraph,
              ),
            );
          }

          if (item.event === 'agent-start') {
            setResults((current) =>
              current.map((paragraph, index) =>
                index === resolvedIndex
                  ? {
                      ...paragraph,
                      agents: {
                        ...paragraph.agents,
                        [payload.agent]: {
                          ...paragraph.agents[payload.agent as AgentKey],
                          name: payload.name,
                          status: 'running',
                        },
                      },
                    }
                  : paragraph,
              ),
            );
          }

          if (item.event === 'agent-progress') {
            setResults((current) =>
              current.map((paragraph, index) => {
                const agentKey = payload.agent as AgentKey;

                return index === resolvedIndex
                  ? {
                      ...paragraph,
                      agents: {
                        ...paragraph.agents,
                        [agentKey]: {
                          ...paragraph.agents[agentKey],
                          name: payload.name,
                          status: 'running',
                          progress: [
                            ...paragraph.agents[agentKey].progress,
                            `${payload.time} ${payload.message}`,
                          ],
                        },
                      },
                    }
                  : paragraph;
              }),
            );
          }

          if (item.event === 'agent-result') {
            setResults((current) =>
              current.map((paragraph, index) =>
                index === resolvedIndex
                  ? {
                      ...paragraph,
                      agents: {
                        ...paragraph.agents,
                        [payload.agent]: {
                          ...paragraph.agents[payload.agent as AgentKey],
                          name: payload.name,
                          content:
                            payload.agent === 'rewrite' && paragraph.agents.rewrite.content
                              ? paragraph.agents.rewrite.content
                              : payload.content,
                          status: 'done',
                        },
                      },
                    }
                  : paragraph,
              ),
            );
          }

          if (item.event === 'paragraph-end') {
            setResults((current) =>
              current.map((paragraph, index) =>
                index === resolvedIndex ? { ...paragraph, status: 'done' } : paragraph,
              ),
            );
          }

          if (item.event === 'error') {
            throw new Error(payload.message || '流式改写失败。');
          }
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '请求失败，请稍后重试。');
    } finally {
      setIsStreaming(false);
    }
  }

  async function startRewrite() {
    setResults([]);
    await runRewriteRequest(input);
  }

  async function continueParagraph(index: number) {
    const paragraph = results[index];
    await runRewriteRequest(paragraph.rewritten || paragraph.original, index);
  }

  function acceptParagraph(index: number) {
    setResults((current) =>
      current.map((paragraph, paragraphIndex) =>
        paragraphIndex === index ? { ...paragraph, accepted: true } : paragraph,
      ),
    );
  }

  function toggleSection(sectionId: string) {
    setExpandedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }

  function downloadResult() {
    const blob = new Blob([resultText || '暂无改写结果'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '论文降重结果.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyText(text: string, key: string) {
    if (!text.trim()) {
      return;
    }

    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(''), 1400);
  }

  function renderMarkedText(original: string, rewritten: string) {
    if (!rewritten) {
      return '等待模型输出';
    }

    const source = Array.from(original);
    const target = Array.from(rewritten);
    const rows = source.length + 1;
    const cols = target.length + 1;
    const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

    for (let row = 1; row < rows; row += 1) {
      for (let col = 1; col < cols; col += 1) {
        table[row][col] =
          source[row - 1] === target[col - 1]
            ? table[row - 1][col - 1] + 1
            : Math.max(table[row - 1][col], table[row][col - 1]);
      }
    }

    const keep = new Set<number>();
    let row = source.length;
    let col = target.length;

    while (row > 0 && col > 0) {
      if (source[row - 1] === target[col - 1]) {
        keep.add(col - 1);
        row -= 1;
        col -= 1;
      } else if (table[row - 1][col] >= table[row][col - 1]) {
        row -= 1;
      } else {
        col -= 1;
      }
    }

    return target.map((char, index) =>
      keep.has(index) ? (
        <React.Fragment key={`${char}-${index}`}>{char}</React.Fragment>
      ) : (
        <mark key={`${char}-${index}`}>{char}</mark>
      ),
    );
  }

  return (
    <main className="app-shell">
      <section className="hero-section">
        <nav className="topbar">
          <div className="brand">
            <div className="brand-icon">
              <GraduationCap size={24} />
            </div>
            <div>
              <strong>MultiRewrite-</strong>
              <span>多 AI 协作 · 轻松降重至 10% 以下</span>
            </div>
          </div>
          <button className="ghost-button">查看规范</button>
        </nav>

        <div className="hero-content">
          <div>
            <div className="eyebrow">
              <Sparkles size={16} />
              多模型多角色协作流水线
            </div>
            <h1>多 AI 分工协作，轻松将论文重复率降低到 10% 以下</h1>
            <p>
              每段内容会经过总结逻辑、上下文衔接、图表检测、终审约束和最终改写五个角色处理。系统保留修改前后对比、改写标注和多轮评审，帮助用户稳定优化论文表达。
            </p>
          </div>

          <div className="score-card">
            <div className="score-title">
              <ShieldCheck size={20} />
              任务状态
            </div>
            <div className="score-grid">
              <div>
                <span>重复率预估</span>
                <strong>{estimatedRepeat}%</strong>
              </div>
              <div>
                <span>AIGC 风险</span>
                <strong>{estimatedAigc}%</strong>
              </div>
              <div>
                <span>完成段落</span>
                <strong>{doneCount}/{results.length || 0}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace-grid rewrite-workspace">
        <aside className="control-panel card">
          <div className="section-title">
            <PenLine size={20} />
            改写设置
          </div>

          <div className="mode-list">
            {(Object.keys(modeLabels) as RewriteMode[]).map((item) => (
              <button
                className={mode === item ? 'mode-card active' : 'mode-card'}
                key={item}
                onClick={() => setMode(item)}
                disabled={isStreaming}
              >
                <strong>{modeLabels[item]}</strong>
                <span>
                  {item === 'academic'
                    ? '适合终稿润色，强调规范术语。'
                    : item === 'natural'
                      ? '降低机械感，增强人工表达。'
                      : '少量调整，保留原文结构。'}
                </span>
              </button>
            ))}
          </div>

          <label className="range-field">
            <span>改写强度：{strength}%</span>
            <input
              type="range"
              min="20"
              max="90"
              value={strength}
              disabled={isStreaming}
              onChange={(event) => setStrength(Number(event.target.value))}
            />
          </label>

          <div className="warning-box">
            <AlertTriangle size={18} />
            <p>DeepSeek 结果需要人工复核。系统不会伪造引用、数据或研究结论。</p>
          </div>
        </aside>

        <section className="editor-panel card">
          <div className="panel-header">
            <div className="section-title">
              <FileText size={20} />
              原文输入
            </div>
            <button className="tiny-button" onClick={() => setInput(sampleText)} disabled={isStreaming}>
              填入示例
            </button>
          </div>
          <textarea
            value={input}
            disabled={isStreaming}
            onChange={(event) => setInput(event.target.value)}
            placeholder="粘贴论文段落，空行会被识别为分段"
          />
          <div className="editor-footer">
            <div className="input-meta">当前字数：{wordCount}</div>
            <button className="primary-button" disabled={isStreaming || !input.trim()} onClick={startRewrite}>
              <RefreshCw size={18} />
              {isStreaming ? '正在流式改写' : '开始逐段降重'}
            </button>
          </div>
        </section>
      </section>

      {error && <div className="error-banner">{error}</div>}

      {structure && (
        <section className="outline-panel card">
          <div className="panel-header">
            <div className="section-title">
              <BookOpenText size={20} />
              论文结构识别
            </div>
            <div className="result-actions">
              <span className="tag">{structure.documentType === 'full-paper' ? '全篇论文' : '片段段落'}</span>
              <button className="tiny-button" onClick={() => setIsOutlineCollapsed((value) => !value)}>
                {isOutlineCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                {isOutlineCollapsed ? '展开目录' : '隐藏目录'}
              </button>
            </div>
          </div>
          {!isOutlineCollapsed && (
            <div className="outline-list">
              {structure.sections.map((section) => {
                const sectionResults = results.filter((item) => item.sectionId === section.id);
                const completed = sectionResults.filter((item) => item.status === 'done').length;

                return (
                  <div className="outline-row" key={section.id}>
                    <div className="outline-row-main">
                      <span className="outline-index">{section.id.replace('section-', '')}</span>
                      <div>
                        <strong>{section.title}</strong>
                        <p>{section.summary}</p>
                      </div>
                    </div>
                    <span className="outline-progress">
                      段落 {section.paragraphStart + 1} - {section.paragraphEnd + 1} · 完成 {completed}/{sectionResults.length}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="comparison-panel card">
        <div className="panel-header">
          <div className="section-title">
            <ClipboardCheck size={20} />
            多 AI 协作结果与修改对比
          </div>
          <div className="result-actions">
            <span className="tag">{isStreaming ? '流式输出中' : modeLabels[mode]}</span>
            <button className="tiny-button" disabled={!resultText.trim()} onClick={() => copyText(resultText, 'all')}>
              <Copy size={15} />
              {copiedKey === 'all' ? '已复制' : '复制全部'}
            </button>
            <button className="tiny-button" disabled={!resultText.trim()} onClick={downloadResult}>
              <Download size={15} />
              导出结果
            </button>
          </div>
        </div>

        {results.length === 0 ? (
          <div className="empty-result">点击开始逐段降重后，这里会实时展示每个段落的改写结果。</div>
        ) : (
          <div className="paragraph-list">
            {(structure?.sections || [{ id: 'section-1', title: '片段内容', summary: '', paragraphStart: 0, paragraphEnd: results.length - 1 }]).map((section) => (
              <section className="section-result-group" key={section.id}>
                <button className="section-result-toggle" onClick={() => toggleSection(section.id)}>
                  <span>{section.title}</span>
                  <strong>
                    {results.filter((item) => item.sectionId === section.id && item.status === 'done').length}/
                    {results.filter((item) => item.sectionId === section.id).length} 段
                  </strong>
                  {expandedSections[section.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {expandedSections[section.id] && results.map((item, index) => item.sectionId === section.id && (
              <article className="paragraph-card" key={`${item.original}-${index}`}>
                <header>
                  <strong>第 {index + 1} 段</strong>
                  <div className="paragraph-actions">
                    <span className="round-badge">第 {item.round} 轮</span>
                    {item.accepted && <span className="status done">已接受</span>}
                    <button
                      className="tiny-button"
                      disabled={isStreaming || item.status !== 'done'}
                      onClick={() => continueParagraph(index)}
                    >
                      <RefreshCw size={14} />
                      下一轮评审改写
                    </button>
                    <button
                      className="tiny-button"
                      disabled={isStreaming || item.status !== 'done' || item.accepted}
                      onClick={() => acceptParagraph(index)}
                    >
                      接受本段
                    </button>
                    <button
                      className="tiny-button"
                      disabled={!item.rewritten.trim()}
                      onClick={() => copyText(item.rewritten, `paragraph-${index}`)}
                    >
                      <Copy size={14} />
                      {copiedKey === `paragraph-${index}` ? '已复制' : '复制本段'}
                    </button>
                    <span className={`status ${item.status}`}>{item.status === 'done' ? '已完成' : item.status === 'streaming' ? '生成中' : '等待中'}</span>
                  </div>
                </header>
                <div className="compare-grid">
                  <div>
                    <h4>修改前</h4>
                    <p>{item.original}</p>
                  </div>
                  <div>
                    <h4>修改后 <span>黄色为新增或改写痕迹</span></h4>
                    <p>{renderMarkedText(item.original, item.rewritten)}</p>
                  </div>
                </div>
                <div className="agent-grid">
                  {(Object.keys(agentLabels) as AgentKey[]).map((agentKey) => {
                    const agent = item.agents[agentKey];

                    return (
                      <section className="agent-card" key={agentKey}>
                        <div className="agent-card-header">
                          <strong>{agentLabels[agentKey]}</strong>
                          <span className={`agent-status ${agent.status}`}>
                            {agent.status === 'done' ? '已完成' : agent.status === 'running' ? '处理中' : '等待中'}
                          </span>
                        </div>
                        <small>{agent.name}</small>
                        <ul className="agent-progress-list">
                          {agent.progress.length ? (
                            agent.progress.map((message) => <li key={message}>{message}</li>)
                          ) : (
                            <li>等待开始处理</li>
                          )}
                        </ul>
                        <p>{agent.content || '等待该角色输出'}</p>
                      </section>
                    );
                  })}
                </div>
              </article>
                ))}
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="feature-grid">
        <div className="feature-card">
          <BookOpenText size={22} />
          <h3>推荐方案</h3>
          <p>第一版采用逐段落降重，便于控制上下文长度、失败重试和前端对照展示。</p>
        </div>
        <div className="feature-card">
          <CheckCircle2 size={22} />
          <h3>进阶方案</h3>
          <p>先提取全文术语、观点与风格约束，再逐段改写，可减少段落间表达不一致。</p>
        </div>
        <div className="feature-card">
          <ShieldCheck size={22} />
          <h3>合规边界</h3>
          <p>定位为论文修改辅助工具，不生成虚假引用、数据、实验过程或研究结论。</p>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

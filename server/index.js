import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';

const app = express();
const port = Number(process.env.PORT || 8787);
const server = createServer(app);

app.use(express.json({ limit: '2mb' }));

const modePrompts = {
  academic: '保持学术规范、逻辑严谨，优化句式与术语衔接。',
  natural: '减少机械感和模板化表达，让文字更像人工写作。',
  conservative: '保守改写，只调整重复风险较高的表达，尽量保留原句结构。',
};

const agentNames = {
  summary: '段落总结与逻辑分析员',
  rewrite: '降重降 AIGC 改写员',
  bridge: '上下文衔接员',
  chart: '图表需求检测员',
  review: '终审员',
};

const modelProviders = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/chat/completions',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    modelEnv: 'DEEPSEEK_MODEL',
    defaultModel: 'deepseek-chat',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    apiKeyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
    defaultModel: 'gpt-4o-mini',
  },
  qwen: {
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKeyEnv: 'QWEN_API_KEY',
    modelEnv: 'QWEN_MODEL',
    defaultModel: 'qwen-plus',
  },
  zhipu: {
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    apiKeyEnv: 'ZHIPU_API_KEY',
    modelEnv: 'ZHIPU_MODEL',
    defaultModel: 'glm-4-flash',
  },
  custom: {
    label: '自定义 OpenAI-Compatible',
    baseUrl: '',
    apiKeyEnv: 'CUSTOM_MODEL_API_KEY',
    modelEnv: 'CUSTOM_MODEL_NAME',
    defaultModel: '',
  },
};

app.get('/api/health', (_req, res) => {
  const providerName = process.env.MODEL_PROVIDER || 'deepseek';
  const provider = modelProviders[providerName] || modelProviders.deepseek;

  res.json({
    ok: true,
    provider: provider.label,
    model: process.env[provider.modelEnv] || process.env.MODEL_NAME || provider.defaultModel,
  });
});

function splitParagraphs(text) {
  return text
    .split(/\n\s*\n|\r\n\s*\r\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isSectionHeading(line) {
  return /^(摘要|关键词|引言|绪论|结论|参考文献|致谢)$/i.test(line.trim())
    || /^第[一二三四五六七八九十\d]+[章节部分]/.test(line.trim())
    || /^([一二三四五六七八九十]+、|\d+(\.\d+)*[、.．\s])/.test(line.trim())
    || /^（[一二三四五六七八九十\d]+）/.test(line.trim());
}

function buildDocumentStructure(text) {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  const headingIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter((item) => isSectionHeading(item.line));
  const isFullPaper = headingIndexes.length >= 2 || text.length > 2500;

  if (!isFullPaper || headingIndexes.length < 2) {
    const paragraphs = splitParagraphs(text);

    return {
      documentType: 'fragment',
      sections: [
        {
          id: 'section-1',
          title: '片段内容',
          summary: '用户输入更像论文片段或少量段落，保持逐段改写。',
          paragraphStart: 0,
          paragraphEnd: Math.max(0, paragraphs.length - 1),
        },
      ],
      paragraphs,
      paragraphSections: paragraphs.map(() => 'section-1'),
    };
  }

  const sections = [];
  const paragraphs = [];
  const paragraphSections = [];

  headingIndexes.forEach((heading, headingPosition) => {
    const nextHeading = headingIndexes[headingPosition + 1];
    const contentLines = lines.slice(heading.index + 1, nextHeading ? nextHeading.index : lines.length);
    const sectionParagraphs = splitParagraphs(contentLines.join('\n'));
    const sectionId = `section-${headingPosition + 1}`;
    const paragraphStart = paragraphs.length;

    sectionParagraphs.forEach((paragraph) => {
      paragraphs.push(paragraph);
      paragraphSections.push(sectionId);
    });

    sections.push({
      id: sectionId,
      title: heading.line,
      summary: sectionParagraphs[0]?.slice(0, 120) || '该小节暂无正文内容。',
      paragraphStart,
      paragraphEnd: Math.max(paragraphStart, paragraphs.length - 1),
    });
  });

  return {
    documentType: 'full-paper',
    sections,
    paragraphs,
    paragraphSections,
  };
}

function sseWrite(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sendAgentProgress(res, index, agent, message) {
  sseWrite(res, 'agent-progress', {
    index,
    agent,
    name: agentNames[agent],
    message,
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
  });
}

function getModelProvider() {
  const providerName = process.env.MODEL_PROVIDER || 'deepseek';
  const provider = modelProviders[providerName] || modelProviders.deepseek;
  const baseUrl = process.env.MODEL_BASE_URL || provider.baseUrl;
  const apiKey = process.env[provider.apiKeyEnv] || process.env.MODEL_API_KEY;
  const model = process.env[provider.modelEnv] || process.env.MODEL_NAME || provider.defaultModel;

  if (!apiKey) {
    throw new Error(`缺少 ${provider.apiKeyEnv} 或 MODEL_API_KEY，请在 .env 中配置。`);
  }

  if (!baseUrl) {
    throw new Error('缺少 MODEL_BASE_URL，请在 .env 中配置模型接口地址。');
  }

  if (!model) {
    throw new Error('缺少 MODEL_NAME，请在 .env 中配置模型名称。');
  }

  return {
    label: provider.label,
    baseUrl,
    apiKey,
    model,
  };
}

async function callModel(messages, { stream = false, temperature = 0.35 } = {}) {
  const provider = getModelProvider();
  const response = await fetch(provider.baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.model,
      stream,
      temperature,
      messages,
    }),
  });

  if (!response.ok || !response.body) {
    const message = await response.text();
    throw new Error(message || `${provider.label} 请求失败。`);
  }

  return response;
}

async function runAgent(agent, userContent) {
  const response = await callModel(
    [
      {
        role: 'system',
        content: `你是${agentNames[agent]}。请基于论文段落执行指定任务，避免编造事实、数据、引用和结论。输出简洁中文。`,
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    { stream: false, temperature: 0.25 },
  );

  const payload = await response.json();
  return payload.choices?.[0]?.message?.content?.trim() || '';
}

async function streamFinalRewrite({ paragraph, mode, strength, index, total, context }, res) {
  const response = await callModel(
    [
      {
        role: 'system',
        content:
          '你是论文降重与降 AIGC 改写员。只输出最终改写文本。不得新增事实、数据、引用、实验过程和研究结论。保留专业术语、原意和论证关系，降低重复表达和机器感。',
      },
      {
        role: 'user',
        content: `任务：对第 ${index + 1}/${total} 段生成最终改写稿。\n改写风格：${modePrompts[mode] || modePrompts.academic}\n改写强度：${strength}%。\n\n原文：\n${paragraph}\n\n段落总结与上下文逻辑：\n${context.summary}\n\n上下文衔接建议：\n${context.bridge}\n\n终审约束：\n${context.review}\n\n请直接输出最终改写文本。`,
      },
    ],
    { stream: true, temperature: 0.45 },
  );

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed.startsWith('data:')) {
        continue;
      }

      const payload = trimmed.replace(/^data:\s*/, '');

      if (payload === '[DONE]') {
        continue;
      }

      const parsed = JSON.parse(payload);
      const content = parsed.choices?.[0]?.delta?.content || '';

      if (content) {
        sseWrite(res, 'delta', { index, content });
      }
    }
  }
}

async function runParagraphAgents({ paragraphs, mode, strength, index }, res) {
  const paragraph = paragraphs[index];
  const previous = paragraphs[index - 1] || '无';
  const next = paragraphs[index + 1] || '无';
  const total = paragraphs.length;

  sseWrite(res, 'agent-start', { index, agent: 'summary', name: agentNames.summary });
  sendAgentProgress(res, index, 'summary', '正在读取当前段，并对照上一段与下一段的位置。');
  sendAgentProgress(res, index, 'summary', '正在提取核心观点、关键术语和必须保留的信息。');
  const summary = await runAgent(
    'summary',
    `请总结第 ${index + 1}/${total} 段的核心内容，并说明它在全文段落中的上下文逻辑位置。\n\n上一段：\n${previous}\n\n当前段：\n${paragraph}\n\n下一段：\n${next}\n\n输出格式：\n核心内容：...\n上下文逻辑：...\n需要保留：...`,
  );
  sendAgentProgress(res, index, 'summary', '已形成段落核心内容与上下文逻辑摘要。');
  sseWrite(res, 'agent-result', { index, agent: 'summary', name: agentNames.summary, content: summary });

  sseWrite(res, 'agent-start', { index, agent: 'bridge', name: agentNames.bridge });
  sendAgentProgress(res, index, 'bridge', '正在检查当前段与前后段的承接关系。');
  sendAgentProgress(res, index, 'bridge', '正在寻找可能造成上下文断裂的表达。');
  const bridge = await runAgent(
    'bridge',
    `请根据段内内容和上下文，给出当前段改写时的衔接建议。\n\n上一段：\n${previous}\n\n当前段：\n${paragraph}\n\n下一段：\n${next}\n\n段落总结：\n${summary}\n\n输出格式：\n承接上一段：...\n引出下一段：...\n衔接风险：...`,
  );
  sendAgentProgress(res, index, 'bridge', '已生成承接上一段和引出下一段的衔接建议。');
  sseWrite(res, 'agent-result', { index, agent: 'bridge', name: agentNames.bridge, content: bridge });

  sseWrite(res, 'agent-start', { index, agent: 'chart', name: agentNames.chart });
  sendAgentProgress(res, index, 'chart', '正在判断段落中是否存在流程、对比、数据或结构关系。');
  sendAgentProgress(res, index, 'chart', '正在匹配适合的图表类型与素材需求。');
  const chart = await runAgent(
    'chart',
    `请检测当前段是否需要图表、流程图、对比表、数据表或示意图辅助表达。没有需要也要说明原因。\n\n当前段：\n${paragraph}\n\n输出格式：\n是否需要图表：是/否\n建议图表类型：...\n图表内容：...\n素材或数据需求：...`,
  );
  sendAgentProgress(res, index, 'chart', '已完成图表必要性与图表类型判断。');
  sseWrite(res, 'agent-result', { index, agent: 'chart', name: agentNames.chart, content: chart });

  sseWrite(res, 'agent-start', { index, agent: 'review', name: agentNames.review });
  sendAgentProgress(res, index, 'review', '正在检查事实边界、术语边界和引用风险。');
  sendAgentProgress(res, index, 'review', '正在整理最终改写必须遵守的审查约束。');
  const review = await runAgent(
    'review',
    `请作为终审员，列出当前段改写时必须遵守的风险控制要求。\n\n当前段：\n${paragraph}\n\n段落总结：\n${summary}\n\n衔接建议：\n${bridge}\n\n图表建议：\n${chart}\n\n输出格式：\n事实边界：...\n术语边界：...\n降 AIGC 注意点：...\n最终审查标准：...`,
  );
  sendAgentProgress(res, index, 'review', '已形成终审约束，准备交给最终改写角色。');
  sseWrite(res, 'agent-result', { index, agent: 'review', name: agentNames.review, content: review });

  sseWrite(res, 'agent-start', { index, agent: 'rewrite', name: agentNames.rewrite });
  sendAgentProgress(res, index, 'rewrite', '正在综合总结、衔接建议和终审约束。');
  sendAgentProgress(res, index, 'rewrite', '正在生成最终降重降 AIGC 文本，结果将流式输出。');
  await streamFinalRewrite({
    paragraph,
    mode,
    strength,
    index,
    total,
    context: {
      summary,
      bridge,
      review,
    },
  }, res);
  sendAgentProgress(res, index, 'rewrite', '最终改写文本已生成完成。');
  sseWrite(res, 'agent-result', { index, agent: 'rewrite', name: agentNames.rewrite, content: '最终改写已完成。' });
}

app.post('/api/rewrite-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  try {
    const { text = '', mode = 'academic', strength = 60 } = req.body || {};
    const structure = buildDocumentStructure(text);
    const { paragraphs } = structure;

    if (!paragraphs.length) {
      sseWrite(res, 'error', { message: '请先输入论文内容。' });
      return res.end();
    }

    sseWrite(res, 'start', {
      total: paragraphs.length,
      paragraphs,
      structure,
    });

    for (let index = 0; index < paragraphs.length; index += 1) {
      sseWrite(res, 'paragraph-start', { index });
      await runParagraphAgents(
        {
          paragraphs,
          mode,
          strength,
          index,
        },
        res,
      );
      sseWrite(res, 'paragraph-end', { index });
    }

    sseWrite(res, 'done', { ok: true });
    res.end();
  } catch (error) {
    sseWrite(res, 'error', {
      message: error instanceof Error ? error.message : '服务端处理失败。',
    });
    res.end();
  }
});

server.listen(port, () => {
  console.log(`DeepSeek rewrite server listening on http://localhost:${port}`);
});

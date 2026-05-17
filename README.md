# MultiRewrite-

MultiRewrite- 是一个网页端论文改写工具，用于辅助论文降重、降低 AIGC 表达痕迹和学术润色。

项目展示页强调：在保留原意、术语和论证逻辑的前提下，通过多 AI 协作与多轮评审改写，可以轻松将论文重复率降低到 **10% 以下**。

项目采用前后端分离结构：

- **前端**：Vite、React、TypeScript
- **后端**：Express 模型代理
- **模型接口**：支持 DeepSeek、OpenAI、通义千问、智谱 GLM 和自定义 OpenAI-Compatible 服务

浏览器不会直接接触模型 API Key，所有模型请求都由后端代理完成。

## 功能介绍

- **论文结构识别**：自动判断输入是全篇论文还是片段段落。
- **目录式小节展示**：全篇论文会按章节、小节生成一行一行的目录。
- **逐段改写**：每个小节下继续按段落处理。
- **多 AI 协作**：每段会经过总结、衔接、图表检测、终审和最终改写。
- **过程反馈**：每个智能体都会显示当前处理状态和过程输出。
- **流式改写**：最终改写内容会实时输出。
- **修改标注**：修改后文本会高亮显示新增或改写痕迹。
- **多轮改写**：用户可以决定接受本段，或进入下一轮评审改写。
- **复制与导出**：支持复制本段、复制全部和导出结果。
- **低重复率目标**：面向论文降重场景，展示目标为将重复率降低到 **10% 以下**。

## 本地运行

### 1. 克隆项目

```bash
git clone https://github.com/424431185/MultiRewrite-.git
```

进入项目目录：

```bash
cd MultiRewrite-
```

如果你是直接下载 ZIP，也可以解压后进入项目文件夹。

### 2. 安装依赖

```bash
npm install
```

### 3. 创建环境变量文件

复制示例配置：

```bash
cp .env.example .env
```

Windows PowerShell 也可以使用：

```powershell
Copy-Item .env.example .env
```

### 4. 配置模型

默认使用 DeepSeek：

```env
PORT=8787
MODEL_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-chat
```

### 5. 启动项目

```bash
npm run dev
```

启动后访问：

```text
http://localhost:5173
```

### 6. 构建生产版本

```bash
npm run build
```

## 模型配置说明

通过 `.env` 中的 `MODEL_PROVIDER` 切换模型供应商。

```env
MODEL_PROVIDER=deepseek
```

可选值：

- **deepseek**：DeepSeek
- **openai**：OpenAI
- **qwen**：通义千问 DashScope 兼容模式
- **zhipu**：智谱 GLM
- **custom**：自定义 OpenAI-Compatible 服务

### DeepSeek

```env
MODEL_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-chat
```

### OpenAI

```env
MODEL_PROVIDER=openai
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-4o-mini
```

### 通义千问

```env
MODEL_PROVIDER=qwen
QWEN_API_KEY=你的 DashScope API Key
QWEN_MODEL=qwen-plus
```

### 智谱 GLM

```env
MODEL_PROVIDER=zhipu
ZHIPU_API_KEY=你的智谱 API Key
ZHIPU_MODEL=glm-4-flash
```

### 自定义模型服务

适用于兼容 OpenAI `chat/completions` 协议的模型服务。

```env
MODEL_PROVIDER=custom
MODEL_BASE_URL=https://你的服务地址/v1/chat/completions
MODEL_API_KEY=你的 API Key
MODEL_NAME=你的模型名称
```

## 使用教程

### 1. 输入论文内容

打开网页后，在“原文输入”区域粘贴论文内容。

可以输入：

- **完整论文**
- **某一章节**
- **几个段落**

如果是完整论文，建议保留原始标题，例如：

```text
摘要
1 引言
1.1 研究背景
1.2 研究意义
2 相关研究
结论
```

系统会根据标题判断论文结构。

### 2. 选择改写方式

在左侧选择改写模式：

- **学术规范**：适合论文终稿润色。
- **自然表达**：适合降低机械感和模板化表达。
- **保守改写**：适合只做轻度修改。

然后调整“改写强度”。

### 3. 开始逐段降重

点击：

```text
开始逐段降重
```

系统会先识别论文结构，再逐段执行多 AI 协作。

### 4. 查看论文目录

如果输入的是完整论文，页面会显示“论文结构识别”。

目录会以一行一行的小节方式展示：

```text
1  摘要
2  1 引言
3  1.1 研究背景
4  1.2 研究意义
```

如果内容太多，可以点击：

```text
隐藏目录
```

需要查看时再点击：

```text
展开目录
```

### 5. 查看小节改写结果

每个小节默认折叠，避免页面内容堆叠过多。

点击小节标题，可以展开该小节下的段落结果。

每个段落会显示：

- **修改前**
- **修改后**
- **改写标注**
- **智能体过程反馈**
- **智能体最终输出**

### 6. 理解多 AI 协作流程

每段内容会依次经过：

- **总结与逻辑**：总结段落内容，判断上下文逻辑。
- **上下文衔接**：检查和前后段落是否连贯。
- **图表检测**：判断是否需要图表、流程图或对比表。
- **终审约束**：检查事实、术语和学术边界。
- **最终改写**：输出降重降 AIGC 后的文本。

最终改写会实时输出到“修改后”和“最终改写”角色卡片中。

### 7. 决定是否继续下一轮

每段完成后，可以选择：

- **下一轮评审改写**：对当前段落再次执行多智能体评审和改写。
- **接受本段**：确认当前结果，不再继续修改。
- **复制本段**：复制当前段的改写结果。

### 8. 复制或导出全文

当多个段落完成后，可以使用：

- **复制全部**
- **导出结果**

导出文件为 `.txt`。

## 常见问题

### 端口 8787 被占用

如果启动时报错：

```text
EADDRINUSE: address already in use :::8787
```

说明已有旧后端进程占用了端口。

可以关闭旧终端，或结束占用 `8787` 的 Node 进程后重新运行：

```bash
npm run dev
```

### 前端提示无法连接后端

请检查：

- 后端是否正常启动。
- `.env` 是否配置了 API Key。
- `PORT` 是否为 `8787`。
- `vite.config.ts` 中 `/api` 代理是否指向 `http://localhost:8787`。

### API Key 会不会暴露

不会。

`.env` 文件已被 `.gitignore` 忽略，前端也不会直接读取模型 API Key。

## 合规说明

本项目用于论文修改辅助，不应生成虚假引用、虚假实验、虚假数据或不存在的研究结论。

模型输出需要用户自行复核后再使用。

# 项目架构说明

## 技术栈

- Vite：前端构建工具
- React：页面与交互开发
- TypeScript：类型约束
- lucide-react：图标组件
- CSS：自定义响应式样式

## 目录结构

```text
降重/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
├── ARCHITECTURE.md
└── src/
    ├── main.tsx
    └── styles.css
```

## 页面模块

- 顶部品牌区：展示项目定位与操作入口
- 数据看板：展示重复率、AIGC 风险和文本字数
- 设置面板：管理改写模式与改写强度
- 原文输入区：输入论文段落或章节内容
- 改写结果区：展示前端模拟改写结果
- 功能说明区：解释语义保真、风险提示和合规边界

## 数据流

1. 用户在原文输入区编辑文本。
2. 用户选择改写模式并调整强度。
3. 页面根据输入内容、模式和强度生成模拟结果。
4. 预估指标随文本和强度变化自动更新。

## 后续接口预留

建议后续新增 `src/services` 目录，统一封装：

- `rewriteService`：论文改写接口
- `detectionService`：查重与 AIGC 检测接口
- `documentService`：文档上传、解析与导出接口

## 合规边界

本项目应定位为论文修改辅助工具，不应生成虚假引用、实验数据或研究结论。所有改写结果需要用户自行复核。

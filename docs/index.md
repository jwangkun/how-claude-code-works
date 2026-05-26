---
layout: home
hero:
  name: "Claude Code 原理与源码拆解"
  text: "Anthropic 终端 AI Agent 的源码级深度分析"
  tagline: 基于 claude-code-rev 逆向还原源码树，从工程视角完整拆解 Claude Code 的启动流程、工具系统、命令系统、系统提示词、MCP 客户端、Ink TUI、状态管理和功能开关双机制。
  image:
    src: /logo.png
    alt: Claude Code
  actions:
    - theme: brand
      text: 开始阅读
      link: /quick-start
    - theme: alt
      text: 源码阅读地图
      link: /source/source-map
features:
  - title: 基于真实源码
    details: 基于 claude-code-rev 逆向还原源码树，分析 Claude Code 的真实架构设计。每一节回答「为什么这样设计」和「生产级 Agent 的关键工程决策」。
  - title: 系统性深度分析
    details: 16 个源码分析专题，覆盖启动流程、工具系统、命令系统、系统提示词、技能系统、插件系统、MCP 客户端、Ink TUI、状态管理和功能开关等全部核心子系统。
  - title: 架构评估与重构方案
    details: 包含完整的架构缺陷分析（5 大问题领域）和 4 阶段重构方案，帮助理解大规模 TypeScript 项目的演进与治理。
---

## 课程结构

本教程分为三大部分，从概念到源码逐层深入。

### 第一部分：核心概念

理解 Claude Code 的基本架构和设计哲学。

<div class="grid-container">
  <div class="grid-item">
    <div class="grid-icon">🎯</div>
    <a href="/concepts/what-is-claude-code"><strong>Claude Code 到底是什么</strong></a>
    <p>定位、核心闭环（Agent Loop）、技术栈全景</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🏗️</div>
    <a href="/concepts/cc-architecture"><strong>总体架构</strong></a>
    <p>三层架构（启动/CLI/运行）详解</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🔧</div>
    <a href="/concepts/tools-and-tool-system"><strong>工具系统</strong></a>
    <p>55 个工具的注册与执行机制</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">⌨️</div>
    <a href="/concepts/commands"><strong>命令系统</strong></a>
    <p>102+ 斜杠命令的设计哲学与分类</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">📝</div>
    <a href="/concepts/system-prompt"><strong>系统提示词分析</strong></a>
    <p>动态多源的系统提示词构造</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">💾</div>
    <a href="/concepts/sessions-and-state"><strong>会话与状态管理</strong></a>
    <p>三层状态持久化与恢复机制</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🔌</div>
    <a href="/concepts/mcp-and-extensions"><strong>MCP 与扩展机制</strong></a>
    <p>外部服务集成协议详解</p>
  </div>
</div>

---

### 第二部分：源码深度分析

深入源码层，逐模块分析 Claude Code 的关键子系统。

<div class="grid-container">
  <div class="grid-item">
    <div class="grid-icon">🗺️</div>
    <a href="/source/source-map"><strong>源码阅读地图</strong></a>
    <p>784 个文件的宏观布局与阅读路线</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🚀</div>
    <a href="/source/bootstrap-flow"><strong>启动流程深度分析</strong></a>
    <p>9 阶段启动序列与 13 条快速路径</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🛠️</div>
    <a href="/source/tools-deep-dive"><strong>工具系统实现分析</strong></a>
    <p>Tool 接口、55 工具完整清单、权限门控</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">⚙️</div>
    <a href="/source/tools-architecture"><strong>工具注册与执行机制</strong></a>
    <p>buildTool 工厂、MCPTool 适配器、条件 require</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">📋</div>
    <a href="/source/commands-deep-dive"><strong>命令系统实现分析</strong></a>
    <p>Command 类型体系、四管道加载、102+ 命令逐一分析</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🔀</div>
    <a href="/source/commands-system"><strong>命令加载管道机制</strong></a>
    <p>Bundled/Disk/Plugin/MCP 四源加载</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">💬</div>
    <a href="/source/messages-system-deep"><strong>消息构造管线</strong></a>
    <p>消息类型层次、格式化管道、内容块类型、序列化</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🧠</div>
    <a href="/source/system-prompt-analysis"><strong>系统提示词构造管线</strong></a>
    <p>5 阶段动态组装与缓存策略</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🐚</div>
    <a href="/source/bash-system-deep"><strong>Bash 执行系统</strong></a>
    <p>AST 解析器、纵深防御 7 层安全模型、只读模式</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🌐</div>
    <a href="/source/mcp-client-deep"><strong>MCP 客户端实现分析</strong></a>
    <p>8 种传输层、memoized 连接、OAuth 认证</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">📡</div>
    <a href="/source/mcp-client"><strong>MCP 通信协议</strong></a>
    <p>JSON-RPC、配置源、工具路由</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">📚</div>
    <a href="/source/skills-system-deep"><strong>技能系统实现分析</strong></a>
    <p>4 源发现管道、SkillTool 三模式执行</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🧩</div>
    <a href="/source/plugins-system-deep"><strong>插件系统实现分析</strong></a>
    <p>5 来源加载、信任模型、12 UI 组件</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🤖</div>
    <a href="/source/agent-tool-deep"><strong>Agent 工具系统</strong></a>
    <p>子 Agent 衍生、AGENTS.md、协调者模式</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">📡</div>
    <a href="/source/api-client-deep"><strong>API 客户端</strong></a>
    <p>流式请求、重试降级、认证、缓存策略</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">📎</div>
    <a href="/source/attachments-system-deep"><strong>附件处理系统</strong></a>
    <p>30+ 附件类型、图片压缩、Token 预算控制</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">💾</div>
    <a href="/source/session-storage-deep"><strong>会话存储系统</strong></a>
    <p>JSONL 持久化、18+ entry 类型、压缩与恢复</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🖥️</div>
    <a href="/source/ink-tui"><strong>Ink TUI 渲染引擎</strong></a>
    <p>React/Ink 组件树与 REPL 布局</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🖻</div>
    <a href="/source/repl-screen-deep"><strong>REPL 交互界面</strong></a>
    <p>18+ 子组件、流式消息渲染、键盘快捷键</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🖨️</div>
    <a href="/source/print-system-deep"><strong>终端输出系统</strong></a>
    <p>Markdown 渲染、语法高亮、结构化输出</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">📊</div>
    <a href="/source/state-management"><strong>三层状态管理</strong></a>
    <p>Bootstrap/AppState/UI State 协同</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🔐</div>
    <a href="/source/config-auth-permissions-deep"><strong>配置/认证/权限</strong></a>
    <p>5 层配置加载、OAuth PKCE、YOLO 模式</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🔗</div>
    <a href="/source/daemon-bridge-deep"><strong>Daemon 与 Bridge</strong></a>
    <p>远程控制、后台会话、进程管理</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🔌</div>
    <a href="/project/build-08-shims"><strong>Shim 兼容层</strong></a>
    <p>7 个 shim 包与私有模块替代策略</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🚩</div>
    <a href="/source/feature-flags"><strong>功能开关系统</strong></a>
    <p>编译时 DCE + 运行时 USER_TYPE 门控</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🔍</div>
    <a href="/project/testing"><strong>架构缺陷与重构方案</strong></a>
    <p>5 大问题领域 + 4 阶段重构路线</p>
  </div>
</div>

---

### 第三部分：源码重建分析

从工程实践角度分析 Claude Code 的架构决策。

<div class="grid-container">
  <div class="grid-item">
    <div class="grid-icon">📖</div>
    <a href="/project/overview"><strong>项目总览</strong></a>
    <p>功能目标、架构图、目录结构</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">📂</div>
    <a href="/project/code-map"><strong>源码目录映射</strong></a>
    <p>完整目录结构与代码行数热力图</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🛤️</div>
    <a href="/project/build-00-roadmap"><strong>重建路线</strong></a>
    <p>8 步重建路线与环境配置</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">👢</div>
    <a href="/project/build-01-bootstrap"><strong>Bootstrap 入口</strong></a>
    <p>MACRO 注入、快速路径、动态加载</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🔩</div>
    <a href="/project/build-02-tools"><strong>工具系统</strong></a>
    <p>Tool 接口、注册流程、权限体系</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">⌨️</div>
    <a href="/project/build-03-commands"><strong>命令系统</strong></a>
    <p>四管道加载、Conditional require</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">💾</div>
    <a href="/project/build-04-state"><strong>状态管理</strong></a>
    <p>三层状态架构与持久化</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🌐</div>
    <a href="/project/build-05-mcp"><strong>MCP 服务</strong></a>
    <p>连接生命周期与配置源</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🔌</div>
    <a href="/project/build-06-ink-ui"><strong>Ink UI 渲染</strong></a>
    <p>React/Ink 组件树与屏幕状态</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🐛</div>
    <a href="/project/build-07-debug"><strong>调试与验证</strong></a>
    <p>验证清单与常见问题</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🧩</div>
    <a href="/project/build-08-shims"><strong>Shim 兼容层</strong></a>
    <p>7 个 shim 包逐一分析</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">📐</div>
    <a href="/project/backend"><strong>启动链路详解</strong></a>
    <p>9 阶段完整启动序列</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">▶️</div>
    <a href="/project/run"><strong>运行与调试</strong></a>
    <p>运行命令与调试技巧</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🧭</div>
    <a href="/project/extend"><strong>扩展方向</strong></a>
    <p>6 个扩展方向与实现示例</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">📊</div>
    <a href="/project/testing"><strong>架构分析与重构方案</strong></a>
    <p>5 大问题 + 4 阶段重构</p>
  </div>
</div>

---

### 参考

<div class="grid-container">
  <div class="grid-item">
    <div class="grid-icon">⚠️</div>
    <a href="/reference/pitfalls"><strong>常见错误</strong></a>
    <p>理解源码时的 7 个常见误解</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">📚</div>
    <a href="/reference/system-prompt-sources"><strong>系统提示词来源</strong></a>
    <p>50+ 源文件索引与优先级</p>
  </div>
  <div class="grid-item">
    <div class="grid-icon">🔗</div>
    <a href="/reference/sources"><strong>资料来源</strong></a>
    <p>源码、文档与工具链索引</p>
  </div>
</div>

---

### 快速入口

<div class="entry-links">
  <a href="/quick-start" class="entry-link">
    <span class="entry-icon">📖</span>
    <span class="entry-text">学习路线</span>
  </a>
  <a href="/contact" class="entry-link">
    <span class="entry-icon">👤</span>
    <span class="entry-text">关于作者</span>
  </a>
  <a href="https://github.com/jwangkun/claude-code-rev" class="entry-link" target="_blank">
    <span class="entry-icon">💻</span>
    <span class="entry-text">源码仓库</span>
  </a>
</div>

---

### 加入交流群

作者 **鲲鹏 Talk** 全平台同名搜索关注。扫码加入交流群，与更多开发者一起探讨 AI Agent 技术。

<div class="qr-grid-fixed">
  <figure>
    <img src="/wechat-group.jpg" alt="微信交流群" />
    <figcaption>微信交流群</figcaption>
  </figure>
  <figure>
    <img src="/wechat-official.jpg" alt="微信公众号" />
    <figcaption>微信公众号</figcaption>
  </figure>
</div>

<style>
.qr-grid-fixed {
  display: flex;
  gap: 24px;
  margin: 16px 0;
  flex-wrap: wrap;
}

.qr-grid-fixed figure {
  margin: 0;
  text-align: center;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 12px;
  background: var(--vp-c-bg-soft);
  flex: 0 0 auto;
  width: 180px;
}

.qr-grid-fixed img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
}

.qr-grid-fixed figcaption {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}

<style>
.grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin: 16px 0;
}

.grid-item {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 16px;
  background: var(--vp-c-bg-soft);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.grid-item:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.grid-icon {
  font-size: 20px;
  margin-bottom: 6px;
}

.grid-item a {
  font-weight: 600;
  font-size: 14px;
}

.grid-item p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.entry-links {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 12px 0;
}

.entry-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  font-weight: 500;
  font-size: 14px;
  transition: border-color 0.2s, background 0.2s;
}

.entry-link:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-mute);
  text-decoration: none;
}

.entry-icon {
  font-size: 18px;
}

@media (max-width: 640px) {
  .grid-container {
    grid-template-columns: 1fr;
  }
}
</style>

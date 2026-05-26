import { Buffer } from "node:buffer";
import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Claude Code 原理与源码拆解",
  description: "从源码视角完整拆解 Claude Code —— Anthropic 的终端 AI Agent",
  lang: "zh-CN",
  base: "/how-claude-code-works/",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["link", { rel: "icon", href: "/how-claude-code-works/logo.png", type: "image/png" }],
    ["meta", { name: "theme-color", content: "#d97706" }]
  ],
  markdown: {
    lineNumbers: true,
    config(md) {
      const defaultFence = md.renderer.rules.fence;
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const info = token.info.trim();
        if (info === "mermaid") {
          const diagram = Buffer.from(token.content, "utf8").toString("base64");
          return `<Mermaid diagram="${diagram}" />`;
        }
        return defaultFence
          ? defaultFence(tokens, idx, options, env, self)
          : self.renderToken(tokens, idx, options);
      };
    }
  },
  themeConfig: {
    logo: "/logo.png",
    search: {
      provider: "local"
    },
    nav: [
      { text: "学习路线", link: "/quick-start" },
      { text: "核心原理", link: "/concepts/what-is-claude-code" },
      { text: "源码分析", link: "/source/source-map" },
      { text: "重建分析", link: "/project/overview" },
      { text: "关于作者", link: "/contact" },
      { text: "来源", link: "/reference/sources" }
    ],
    sidebar: [
      {
        text: "开始",
        items: [
          { text: "课程首页", link: "/" },
          { text: "运行与学习路线", link: "/quick-start" },
          { text: "关于作者", link: "/contact" }
        ]
      },
      {
        text: "第一部分：核心概念",
        collapsed: false,
        items: [
          { text: "Claude Code 到底是什么", link: "/concepts/what-is-claude-code" },
          { text: "总体架构", link: "/concepts/cc-architecture" },
          { text: "工具系统 (50+ Tools)", link: "/concepts/tools-and-tool-system" },
          { text: "命令系统 (102+ Commands)", link: "/concepts/commands" },
          { text: "系统提示词分析", link: "/concepts/system-prompt" },
          { text: "会话与状态管理", link: "/concepts/sessions-and-state" },
          { text: "MCP 与扩展机制", link: "/concepts/mcp-and-extensions" }
        ]
      },
      {
        text: "第二部分：源码深度分析",
        collapsed: false,
        items: [
          { text: "源码阅读地图", link: "/source/source-map" },
          { text: "启动流程深度分析", link: "/source/bootstrap-flow" },
          { text: "工具系统实现分析", link: "/source/tools-deep-dive" },
          { text: "工具注册与执行机制", link: "/source/tools-architecture" },
          { text: "命令系统实现分析", link: "/source/commands-deep-dive" },
          { text: "命令加载管道机制", link: "/source/commands-system" },
          { text: "消息构造管线", link: "/source/messages-system-deep" },
          { text: "系统提示词构造管线", link: "/source/system-prompt-analysis" },
          { text: "Bash 执行系统", link: "/source/bash-system-deep" },
          { text: "MCP 客户端实现分析", link: "/source/mcp-client-deep" },
          { text: "MCP 通信协议", link: "/source/mcp-client" },
          { text: "技能系统实现分析", link: "/source/skills-system-deep" },
          { text: "插件系统实现分析", link: "/source/plugins-system-deep" },
          { text: "Agent 工具系统", link: "/source/agent-tool-deep" },
          { text: "API 客户端", link: "/source/api-client-deep" },
          { text: "附件处理系统", link: "/source/attachments-system-deep" },
          { text: "会话存储系统", link: "/source/session-storage-deep" },
          { text: "Ink TUI 渲染引擎", link: "/source/ink-tui" },
          { text: "REPL 交互界面", link: "/source/repl-screen-deep" },
          { text: "终端输出系统", link: "/source/print-system-deep" },
          { text: "三层状态管理", link: "/source/state-management" },
          { text: "配置/认证/权限", link: "/source/config-auth-permissions-deep" },
          { text: "Daemon 与 Bridge", link: "/source/daemon-bridge-deep" },
          { text: "Shim 兼容层", link: "/project/build-08-shims" },
          { text: "功能开关系统", link: "/source/feature-flags" },
          { text: "架构缺陷与重构方案", link: "/project/testing" }
        ]
      },
      {
        text: "第三部分：源码重建分析",
        collapsed: false,
        items: [
          { text: "项目总览", link: "/project/overview" },
          { text: "源码目录映射", link: "/project/code-map" },
          { text: "重建路线", link: "/project/build-00-roadmap" },
          { text: "Step 1：Bootstrap 入口", link: "/project/build-01-bootstrap" },
          { text: "Step 2：工具系统", link: "/project/build-02-tools" },
          { text: "Step 3：命令系统", link: "/project/build-03-commands" },
          { text: "Step 4：状态管理", link: "/project/build-04-state" },
          { text: "Step 5：MCP 服务", link: "/project/build-05-mcp" },
          { text: "MCP 深度分析", link: "/project/build-05-mcp-deep" },
          { text: "Step 6：Ink UI 渲染", link: "/project/build-06-ink-ui" },
          { text: "Step 7：调试与验证", link: "/project/build-07-debug" },
          { text: "Step 8：Shim 兼容层", link: "/project/build-08-shims" },
          { text: "启动链路详解", link: "/project/backend" },
          { text: "运行与调试", link: "/project/run" },
          { text: "扩展方向", link: "/project/extend" }
        ]
      },
      {
        text: "参考",
        items: [
          { text: "常见错误", link: "/reference/pitfalls" },
          { text: "系统提示词来源", link: "/reference/system-prompt-sources" },
          { text: "资料来源", link: "/reference/sources" }
        ]
      }
    ],
    outline: {
      level: [2, 3],
      label: "本页目录"
    },
    docFooter: {
      prev: "上一节",
      next: "下一节"
    },
    editLink: {
      pattern: "https://github.com/jwangkun/how-claude-code-works/edit/main/docs/:path",
      text: "编辑此页"
    }
  }
});

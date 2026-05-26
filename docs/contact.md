# 关于作者

## 作者：鲲鹏 Talk

AI 趋势研究者、开源 Agent 深度玩家。

自 2023 年起持续关注大语言模型与 AI Agent 领域，亲历了从 ChatGPT 引爆全球到多模态大模型百花齐放，再到 AI Agent 自主执行能力实现质的飞跃的全过程。

**全平台搜索「鲲鹏Talk」关注我：**

<div class="social-grid">
  <div class="social-item">
    <span class="social-icon">📱</span>
    <span>微信视频号</span>
  </div>
  <div class="social-item">
    <span class="social-icon">📺</span>
    <span>B站</span>
  </div>
  <div class="social-item">
    <span class="social-icon">💬</span>
    <span>微信公众号</span>
  </div>
  <div class="social-item">
    <span class="social-icon">▶️</span>
    <span>YouTube</span>
  </div>
  <div class="social-item">
    <span class="social-icon">📕</span>
    <span>小红书</span>
  </div>
  <div class="social-item">
    <span class="social-icon">🎵</span>
    <span>抖音</span>
  </div>
</div>

---

## 加入交流群

<div class="qr-grid">
  <figure>
    <img src="/wechat-group.jpg" alt="微信交流群二维码" />
    <figcaption>微信交流群</figcaption>
  </figure>
  <figure>
    <img src="/wechat-official.jpg" alt="微信公众号二维码" />
    <figcaption>微信公众号</figcaption>
  </figure>
</div>

扫码加入交流群，与更多开发者一起探讨 AI Agent 技术。

---

## 关于本教程

本教程基于 [claude-code-rev](https://github.com/jwangkun/claude-code-rev) 项目，这是一个通过 source map 逆向还原 + 缺失模块补齐得到的 `@anthropic-ai/claude-code` 源码树。

教程从工程视角完整拆解 Claude Code 的核心架构与实现原理，覆盖启动流程、工具系统、命令系统、消息构造、系统提示词、Bash 执行、MCP 客户端、技能系统、插件系统、Agent 工具、API 客户端、附件处理、会话存储、Ink TUI 渲染、REPL 界面、终端输出、状态管理、配置/认证/权限、Daemon/Bridge、Shim 兼容层和功能开关等 22 个源码分析专题。

## 致谢

感谢所有为 claude-code-rev 项目做出贡献的开发者，以及 Claude Code 的用户社区。本教程的诞生离不开逆向还原团队的卓越工作。

<style>
.social-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin: 16px 0;
}

.social-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  font-weight: 500;
  font-size: 14px;
}

.social-icon {
  font-size: 18px;
}

.qr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
  margin: 24px 0;
  max-width: 520px;
}

.qr-grid figure {
  margin: 0;
  text-align: center;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 16px;
  background: var(--vp-c-bg-soft);
}

.qr-grid img {
  width: 100%;
  max-width: 220px;
  aspect-ratio: 1;
  object-fit: contain;
}

.qr-grid figcaption {
  margin-top: 10px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}
</style>

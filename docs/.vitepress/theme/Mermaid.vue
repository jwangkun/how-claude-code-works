<template>
  <div class="mermaid-wrapper">
    <div v-if="loading" class="mermaid-loading">加载图表中...</div>
    <div v-else ref="mermaidRef"></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";

const props = defineProps({
  diagram: { type: String, required: true }
});

const mermaidRef = ref(null);
const loading = ref(true);

onMounted(async () => {
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    theme: "neutral",
    flowchart: { useMaxWidth: true }
  });
  const decoded = atob(props.diagram);
  if (mermaidRef.value) {
    try {
      const { svg } = await mermaid.render("mermaid-" + Math.random().toString(36).slice(2), decoded);
      mermaidRef.value.innerHTML = svg;
    } catch (e) {
      mermaidRef.value.innerHTML = `<pre class="mermaid-error">Mermaid render error: ${e.message}</pre>`;
    }
  }
  loading.value = false;
});
</script>

<style scoped>
.mermaid-wrapper {
  margin: 16px 0;
  overflow-x: auto;
}
.mermaid-loading {
  color: var(--vp-c-text-2);
  font-size: 13px;
  padding: 12px 0;
  font-style: italic;
}
.mermaid-error {
  color: #e74c3c;
  background: #fdf0ef;
  padding: 12px;
  border-radius: 6px;
  font-size: 13px;
}
</style>

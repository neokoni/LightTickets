<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue';
import MarkdownIt from 'markdown-it';
import { tasklist } from '@mdit/plugin-tasklist';
import type { Options } from 'markdown-it';
import type Renderer from 'markdown-it/lib/renderer.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import { t } from '@/i18n';

const props = defineProps<{ content: string; compact?: boolean }>();

const containerRef = ref<HTMLElement | null>(null);

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
}).use(tasklist, { disabled: true });

md.renderer.rules.checkbox_input = function (tokens, idx) {
  const token = tokens[idx];
  const checked = token.attrGet('checked') !== null;
  const id = md.utils.escapeHtml(token.attrGet('id') || '');
  const checkedAttribute = checked ? ' checked' : '';
  return `<input class="sr-only markdown-task-native-checkbox" type="checkbox" id="${id}"${checkedAttribute} disabled><span class="base-checkbox markdown-task-checkbox" data-checked="${checked}" aria-hidden="true"></span>`;
};

// Open external links in new tab
const defaultRender =
  md.renderer.rules.link_open ||
  function (tokens: Token[], idx: number, options: Options, _env: unknown, self: Renderer): string {
    return self.renderToken(tokens, idx, options);
  };
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return defaultRender(tokens, idx, options, env, self);
};

const rendered = computed(() => md.render(props.content || ''));

function insertCopyButtons(el: HTMLElement) {
  const preBlocks = el.querySelectorAll('pre');
  preBlocks.forEach((pre) => {
    if (pre.querySelector('.copy-btn')) return;
    pre.style.position = 'relative';
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.title = t('markdown.copyCode');
    btn.setAttribute('aria-label', t('markdown.copyCode'));
    btn.innerHTML = `<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><svg class="check-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
    btn.addEventListener('click', () => copyCode(pre));
    pre.appendChild(btn);
  });
}

async function copyCode(pre: HTMLPreElement) {
  const code = pre.querySelector('code');
  const text = code?.textContent || '';
  await navigator.clipboard.writeText(text);
  const btn = pre.querySelector('.copy-btn');
  if (btn) {
    (btn as HTMLElement).dataset.copied = 'true';
    setTimeout(() => {
      delete (btn as HTMLElement).dataset.copied;
    }, 2000);
  }
}

watch(
  rendered,
  () => {
    nextTick(() => {
      if (!containerRef.value) return;
      containerRef.value.innerHTML = rendered.value;
      insertCopyButtons(containerRef.value);
    });
  },
  { immediate: true },
);
</script>

<template>
  <div
    ref="containerRef"
    class="markdown-body prose prose-sm dark:prose-invert max-w-none prose-slate prose-blockquote:not-italic prose-blockquote:font-normal"
    :class="{ 'markdown-body-compact': compact }"
  />
</template>

<style scoped>
.markdown-body :deep(code) {
  font-size: 0.875em;
  font-weight: 600;
  background-color: var(--color-slate-100);
  padding: 0.125rem 0.25rem;
  border-radius: 0.375rem;
}

.dark .markdown-body :deep(code) {
  background-color: var(--color-slate-800);
}

.markdown-body :deep(pre code) {
  display: block;
  overflow-x: auto;
  padding: 1rem;
  background-color: var(--color-slate-50);
  color: var(--color-slate-800);
  border-radius: 0.75rem;
  border: 1px solid rgb(226 232 240 / 0.8);
  font-size: 0.875rem;
  line-height: 1.5;
  font-weight: 400;
}

.dark .markdown-body :deep(pre code) {
  background-color: var(--color-slate-800);
  color: var(--color-slate-100);
  border-color: rgb(30 41 59 / 0.8);
}

.markdown-body :deep(pre) {
  position: relative;
  background: transparent;
  padding: 0;
}

.markdown-body :deep(.copy-btn) {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 2rem;
  height: 2rem;
  padding: 0.375rem;
  border-radius: 0.5rem;
  background-color: var(--color-slate-200);
  color: var(--color-slate-600);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition:
    opacity 0.15s,
    background-color 0.15s;
}

.dark .markdown-body :deep(.copy-btn) {
  background-color: var(--color-slate-700);
  color: var(--color-slate-300);
}

.markdown-body :deep(pre:hover .copy-btn) {
  opacity: 1;
}

.markdown-body :deep(.copy-btn:hover) {
  background-color: var(--color-slate-300);
  color: var(--color-slate-800);
}

.dark .markdown-body :deep(.copy-btn:hover) {
  background-color: var(--color-slate-600);
  color: white;
}

.markdown-body :deep(.copy-btn[data-copied]) {
  color: var(--color-green-500);
}

.dark .markdown-body :deep(.copy-btn[data-copied]) {
  color: var(--color-green-400);
}

.markdown-body :deep(.copy-btn .copy-icon) {
  display: block;
}

.markdown-body :deep(.copy-btn .check-icon) {
  display: none;
}

.markdown-body :deep(.copy-btn[data-copied] .copy-icon) {
  display: none;
}

.markdown-body :deep(.copy-btn[data-copied] .check-icon) {
  display: block;
}

.markdown-body :deep(blockquote p:first-of-type::before) {
  content: none;
}

.markdown-body :deep(blockquote p:last-of-type::after) {
  content: none;
}

.markdown-body :deep(code::before) {
  content: none;
}

.markdown-body :deep(code::after) {
  content: none;
}

.markdown-body :deep(a) {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.markdown-body-compact :deep(p) {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

.markdown-body-compact :deep(hr) {
  margin-top: 1rem;
  margin-bottom: 1rem;
  border-color: rgb(226 232 240 / 0.8);
}

.dark .markdown-body-compact :deep(hr) {
  border-color: rgb(30 41 59 / 0.8);
}

.markdown-body-compact :deep(ul),
.markdown-body-compact :deep(ol) {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

.markdown-body-compact :deep(li) {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

.markdown-body-compact :deep(strong) {
  color: inherit;
}

.markdown-body :deep(.task-list-container) {
  list-style: none;
  padding-inline-start: 0;
}

.markdown-body :deep(.task-list-item) {
  position: relative;
  list-style: none;
}

.markdown-body :deep(.task-list-item .task-list-container) {
  padding-inline-start: 1.5rem;
}

.markdown-body :deep(.markdown-task-checkbox) {
  margin-inline-end: 0.5rem;
  vertical-align: -0.125rem;
}
</style>

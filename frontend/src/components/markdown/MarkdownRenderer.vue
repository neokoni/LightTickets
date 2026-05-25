<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue'
import MarkdownIt from 'markdown-it'

const props = defineProps<{ content: string }>()

const containerRef = ref<HTMLElement | null>(null)

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

// Open external links in new tab
const defaultRender = md.renderer.rules.link_open || function (tokens: any, idx: any, options: any, _env: any, self: any) {
  return self.renderToken(tokens, idx, options)
}
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noopener noreferrer')
  return defaultRender(tokens, idx, options, env, self)
}

const rendered = computed(() => md.render(props.content || ''))

function insertCopyButtons(el: HTMLElement) {
  const preBlocks = el.querySelectorAll('pre')
  preBlocks.forEach((pre) => {
    if (pre.querySelector('.copy-btn')) return
    pre.style.position = 'relative'
    const btn = document.createElement('button')
    btn.className = 'copy-btn'
    btn.title = '复制代码'
    btn.setAttribute('aria-label', '复制代码')
    btn.innerHTML = `<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><svg class="check-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`
    btn.addEventListener('click', () => copyCode(pre))
    pre.appendChild(btn)
  })
}

async function copyCode(pre: HTMLPreElement) {
  const code = pre.querySelector('code')
  const text = code?.textContent || ''
  await navigator.clipboard.writeText(text)
  const btn = pre.querySelector('.copy-btn')
  if (btn) {
    (btn as HTMLElement).dataset.copied = 'true'
    setTimeout(() => {
      delete (btn as HTMLElement).dataset.copied
    }, 2000)
  }
}

watch(rendered, () => {
  nextTick(() => {
    if (containerRef.value) insertCopyButtons(containerRef.value)
  })
}, { immediate: true })
</script>

<template>
  <div
    ref="containerRef"
    class="markdown-body prose prose-sm dark:prose-invert max-w-none prose-slate prose-blockquote:not-italic prose-blockquote:font-normal"
    v-html="rendered"
  />
</template>

<style>
.markdown-body code {
  font-size: 0.875em;
  font-weight: 600;
  background-color: var(--color-slate-100);
  padding: 0.125rem 0.25rem;
  border-radius: 0.375rem;
}

.dark .markdown-body code {
  background-color: var(--color-slate-800);
}

.markdown-body pre code {
  display: block;
  overflow-x: auto;
  padding: 1rem;
  background-color: var(--color-slate-50) !important;
  color: var(--color-slate-800) !important;
  border-radius: 0.75rem;
  border: 1px solid rgb(226 232 240 / 0.8);
  font-size: 0.875rem;
  line-height: 1.5;
  font-weight: 400;
}

.dark .markdown-body pre code {
  background-color: var(--color-slate-800) !important;
  color: var(--color-slate-100) !important;
  border-color: rgb(30 41 59 / 0.8);
}

.markdown-body pre {
  position: relative;
  background: transparent !important;
  padding: 0 !important;
}

.markdown-body .copy-btn {
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
  transition: opacity 0.15s, background-color 0.15s;
}

.dark .markdown-body .copy-btn {
  background-color: var(--color-slate-700);
  color: var(--color-slate-300);
}

.markdown-body pre:hover .copy-btn {
  opacity: 1;
}

.markdown-body .copy-btn:hover {
  background-color: var(--color-slate-300);
  color: var(--color-slate-800);
}

.dark .markdown-body .copy-btn:hover {
  background-color: var(--color-slate-600);
  color: white;
}

.markdown-body .copy-btn[data-copied] {
  color: var(--color-green-500);
}

.dark .markdown-body .copy-btn[data-copied] {
  color: var(--color-green-400);
}

.markdown-body .copy-btn .copy-icon {
  display: block;
}

.markdown-body .copy-btn .check-icon {
  display: none;
}

.markdown-body .copy-btn[data-copied] .copy-icon {
  display: none;
}

.markdown-body .copy-btn[data-copied] .check-icon {
  display: block;
}

.markdown-body blockquote p:first-of-type::before {
  content: none !important;
}

.markdown-body blockquote p:last-of-type::after {
  content: none !important;
}

.markdown-body code::before {
  content: none !important;
}

.markdown-body code::after {
  content: none !important;
}

.markdown-body a {
  text-decoration: underline !important;
  text-underline-offset: 2px !important;
}
</style>

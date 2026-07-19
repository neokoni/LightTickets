<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';

const props = withDefaults(
  defineProps<{
    activeKey: string;
    as?: string;
  }>(),
  {
    as: 'div',
  },
);

const container = ref<HTMLElement | null>(null);
const indicatorStyle = ref<CSSProperties>({});
const ready = ref(false);
let resizeObserver: InstanceType<typeof window.ResizeObserver> | undefined;
let observedElements: HTMLElement[] = [];
let readyFrame: number | undefined;

function syncObservedElements(elements: HTMLElement[]) {
  if (
    elements.length === observedElements.length &&
    elements.every((element, index) => element === observedElements[index])
  ) {
    return;
  }

  resizeObserver?.disconnect();
  elements.forEach((element) => resizeObserver?.observe(element));
  observedElements = elements;
}

function hideIndicator() {
  if (readyFrame !== undefined) window.cancelAnimationFrame(readyFrame);
  readyFrame = undefined;
  ready.value = false;
}

async function updateIndicator() {
  await nextTick();
  if (!container.value) return;

  const targets = Array.from(container.value.querySelectorAll<HTMLElement>('[data-sliding-tab]'));
  syncObservedElements([container.value, ...targets]);

  const target = targets.find((element) => element.dataset.slidingTab === props.activeKey);
  if (!target) {
    hideIndicator();
    return;
  }

  const containerRect = container.value.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if (targetRect.width === 0) {
    hideIndicator();
    return;
  }
  const left = targetRect.left - containerRect.left + container.value.scrollLeft;

  indicatorStyle.value = {
    width: `${targetRect.width}px`,
    transform: `translateX(${left}px)`,
  };

  if (!ready.value && readyFrame === undefined) {
    readyFrame = window.requestAnimationFrame(() => {
      ready.value = true;
      readyFrame = undefined;
    });
  }
}

watch(() => props.activeKey, updateIndicator, { flush: 'post' });

onMounted(() => {
  resizeObserver = new window.ResizeObserver(() => void updateIndicator());
  void updateIndicator();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (readyFrame !== undefined) window.cancelAnimationFrame(readyFrame);
});
</script>

<template>
  <component :is="as" ref="container" class="sliding-tabs">
    <slot />
    <span
      class="sliding-tabs-indicator"
      :class="{ 'sliding-tabs-indicator-ready': ready }"
      :style="indicatorStyle"
      aria-hidden="true"
    />
  </component>
</template>

<style scoped>
.sliding-tabs {
  position: relative;
}

.sliding-tabs-indicator {
  position: absolute;
  bottom: 0;
  left: 0;
  z-index: 1;
  height: 2.5px;
  border-radius: 9999px;
  background-color: currentColor;
  opacity: 0;
  pointer-events: none;
}

.sliding-tabs-indicator-ready {
  opacity: 1;
  transition:
    width 0.28s ease,
    transform 0.28s ease,
    opacity 0.15s ease;
}
</style>

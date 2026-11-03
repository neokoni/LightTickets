<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { t } from '@/i18n';
import type { LightboxImage, LightboxOrigin } from '@/types/image-viewer';

const props = defineProps<{
  images: LightboxImage[];
  initialIndex?: number;
  originRect?: LightboxOrigin;
}>();

const modelValue = defineModel<boolean>({ required: true });

const MIN_SCALE = 0.25;
const MAX_SCALE = 6;
const DOUBLE_CLICK_SCALE = 1.5;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const CLOSE_ANIMATION_MS = 220;
const FLIP_ANIMATION_MS = 280;
const DOUBLE_TAP_DELAY_MS = 400;
const DOUBLE_TAP_DISTANCE_PX = 30;

interface FlipClone extends LightboxOrigin {
  src: string;
  alt?: string;
}

const viewportRef = ref<HTMLElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);
const dialogRef = ref<HTMLElement | null>(null);
const activeIndex = ref(0);
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const dragging = ref(false);
const imageSize = ref({ width: 0, height: 0 });
const flipTransform = ref<string | null>(null);
const flipPending = ref(false);
const closing = ref(false);
const flipClone = ref<FlipClone | null>(null);
const cloneTransform = ref('');
const navbarHeight = ref(0);

const images = computed(() => props.images.filter((image) => image.src));
const currentImage = computed(() => images.value[activeIndex.value] ?? null);
const hasMultiple = computed(() => images.value.length > 1);
const zoomPercent = computed(() => Math.round(scale.value * 100));
const imageTransform = computed(
  () =>
    flipTransform.value ??
    `translate3d(${offsetX.value}px, ${offsetY.value}px, 0) scale(${scale.value})`,
);
const transitionClip = computed(() => {
  if (!flipPending.value && !closing.value) return 'none';
  if (navbarHeight.value <= 0) return 'none';
  return `inset(${navbarHeight.value}px 0 0 0)`;
});

const pointers = new Map<number, { x: number; y: number }>();
let dragStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 };
let pinchStart: { distance: number; scale: number } | null = null;
let lastPointerFocus: HTMLElement | null = null;
let previousBodyOverflow = '';
let movedDuringGesture = false;
let pointerDownOnImage = false;
let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let flipFrame: number | undefined;
let cloneTimer: ReturnType<typeof setTimeout> | undefined;
let inertApp: HTMLElement | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampOffsets() {
  const viewport = viewportRef.value;
  if (!viewport) return;
  const baseWidth = imageSize.value.width || viewport.clientWidth;
  const baseHeight = imageSize.value.height || viewport.clientHeight;
  const maxX = Math.abs(baseWidth * scale.value - viewport.clientWidth) / 2;
  const maxY = Math.abs(baseHeight * scale.value - viewport.clientHeight) / 2;
  offsetX.value = clamp(offsetX.value, -maxX, maxX);
  offsetY.value = clamp(offsetY.value, -maxY, maxY);
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clearTimers() {
  if (flipFrame !== undefined) cancelAnimationFrame(flipFrame);
  if (closeTimer !== undefined) clearTimeout(closeTimer);
  if (cloneTimer !== undefined) clearTimeout(cloneTimer);
  flipFrame = undefined;
  closeTimer = undefined;
  cloneTimer = undefined;
}

function finishOpenFlip() {
  if (cloneTimer !== undefined) {
    clearTimeout(cloneTimer);
    cloneTimer = undefined;
  }
  flipPending.value = false;
  flipClone.value = null;
  cloneTransform.value = '';
}

function startOpenFlip() {
  const image = imageRef.value;
  const clone = flipClone.value;
  if (!image || !clone || prefersReducedMotion()) {
    finishOpenFlip();
    return;
  }

  const finalRect = image.getBoundingClientRect();
  if (finalRect.width === 0 || finalRect.height === 0 || clone.width === 0 || clone.height === 0) {
    finishOpenFlip();
    return;
  }

  const scaleX = finalRect.width / clone.width;
  const scaleY = finalRect.height / clone.height;
  const deltaX = finalRect.left + finalRect.width / 2 - (clone.left + clone.width / 2);
  const deltaY = finalRect.top + finalRect.height / 2 - (clone.top + clone.height / 2);

  flipFrame = requestAnimationFrame(() => {
    cloneTransform.value = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`;
    cloneTimer = setTimeout(finishOpenFlip, FLIP_ANIMATION_MS);
  });
}

function handleImageLoad() {
  const image = imageRef.value;
  if (!image) return;
  imageSize.value = { width: image.offsetWidth, height: image.offsetHeight };
  clampOffsets();
  if (flipPending.value) startOpenFlip();
}

function closeTargetTransform(): string | null {
  const viewport = viewportRef.value;
  const origin = props.originRect;
  const base = imageSize.value;
  if (!viewport || !origin || base.width === 0 || base.height === 0) return null;

  const viewportRect = viewport.getBoundingClientRect();
  const targetScale = Math.min(origin.width / base.width, origin.height / base.height);
  const deltaX = origin.left + origin.width / 2 - (viewportRect.left + viewportRect.width / 2);
  const deltaY = origin.top + origin.height / 2 - (viewportRect.top + viewportRect.height / 2);
  return `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${targetScale})`;
}

function resetTransform() {
  scale.value = 1;
  offsetX.value = 0;
  offsetY.value = 0;
}

function applyScale(nextScale: number, centerX: number, centerY: number) {
  const viewport = viewportRef.value;
  if (!viewport) return;
  const target = clamp(nextScale, MIN_SCALE, MAX_SCALE);
  if (target === scale.value) return;
  const rect = viewport.getBoundingClientRect();
  const pointX = centerX - (rect.left + rect.width / 2) - offsetX.value;
  const pointY = centerY - (rect.top + rect.height / 2) - offsetY.value;
  const ratio = target / scale.value;
  offsetX.value -= pointX * (ratio - 1);
  offsetY.value -= pointY * (ratio - 1);
  scale.value = target;
  clampOffsets();
}

function zoomBy(factor: number) {
  const viewport = viewportRef.value;
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  applyScale(scale.value * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function zoomIn() {
  zoomBy(1.25);
}

function zoomOut() {
  zoomBy(0.8);
}

function onWheel(event: WheelEvent) {
  const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
  applyScale(scale.value * factor, event.clientX, event.clientY);
}

function onDoubleClick(event: MouseEvent) {
  event.preventDefault();
}

function toggleZoomAt(centerX: number, centerY: number) {
  if (Math.abs(scale.value - 1) > 0.01) {
    resetTransform();
    return;
  }
  applyScale(DOUBLE_CLICK_SCALE, centerX, centerY);
}

function registerTap(event: PointerEvent) {
  const now = Date.now();
  const isDoubleTap =
    now - lastTapTime <= DOUBLE_TAP_DELAY_MS &&
    Math.hypot(event.clientX - lastTapX, event.clientY - lastTapY) <= DOUBLE_TAP_DISTANCE_PX;

  if (isDoubleTap) {
    lastTapTime = 0;
    toggleZoomAt(event.clientX, event.clientY);
    return;
  }

  lastTapTime = now;
  lastTapX = event.clientX;
  lastTapY = event.clientY;
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  pointerDownOnImage = event.target instanceof HTMLElement && event.target.closest('img') !== null;
  viewportRef.value?.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  movedDuringGesture = false;

  if (pointers.size === 1) {
    dragStart = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offsetX.value,
      offsetY: offsetY.value,
    };
    dragging.value = true;
    pinchStart = null;
    return;
  }

  if (pointers.size === 2) {
    const [first, second] = Array.from(pointers.values());
    pinchStart = {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      scale: scale.value,
    };
    dragging.value = true;
  }
}

function onPointerMove(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pointers.size >= 2) {
    const [first, second] = Array.from(pointers.values());
    if (!pinchStart || pinchStart.distance === 0) return;
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    applyScale(
      pinchStart.scale * (distance / pinchStart.distance),
      (first.x + second.x) / 2,
      (first.y + second.y) / 2,
    );
    movedDuringGesture = true;
    return;
  }

  const deltaX = event.clientX - dragStart.x;
  const deltaY = event.clientY - dragStart.y;
  if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) movedDuringGesture = true;
  offsetX.value = dragStart.offsetX + deltaX;
  offsetY.value = dragStart.offsetY + deltaY;
  clampOffsets();
}

function releasePointer(event: PointerEvent) {
  pointers.delete(event.pointerId);
  if (pointers.size === 0) {
    dragging.value = false;
    pinchStart = null;
    if (pointerDownOnImage && !movedDuringGesture) {
      registerTap(event);
    } else {
      lastTapTime = 0;
    }
    return;
  }
  if (pointers.size === 1) {
    const remaining = Array.from(pointers.values())[0];
    dragStart = {
      x: remaining.x,
      y: remaining.y,
      offsetX: offsetX.value,
      offsetY: offsetY.value,
    };
    pinchStart = null;
  }
}

function onViewportClick() {
  const suppressClose = movedDuringGesture || pointerDownOnImage;
  movedDuringGesture = false;
  pointerDownOnImage = false;
  if (!suppressClose) close();
}

function showImage(index: number) {
  if (images.value.length === 0) return;
  activeIndex.value = (index + images.value.length) % images.value.length;
  resetTransform();
  imageSize.value = { width: 0, height: 0 };
}

function showPrevious() {
  showImage(activeIndex.value - 1);
}

function showNext() {
  showImage(activeIndex.value + 1);
}

function close() {
  if (closing.value) return;
  if (flipPending.value) {
    finishOpenFlip();
    modelValue.value = false;
    return;
  }
  const target = prefersReducedMotion() ? null : closeTargetTransform();
  if (!target) {
    modelValue.value = false;
    return;
  }

  flipTransform.value = target;
  closing.value = true;
  closeTimer = setTimeout(() => {
    closeTimer = undefined;
    modelValue.value = false;
  }, CLOSE_ANIMATION_MS);
}

function onKeydown(event: KeyboardEvent) {
  if (!modelValue.value) return;

  switch (event.key) {
    case 'Escape':
      close();
      break;
    case 'ArrowLeft':
      if (hasMultiple.value) showPrevious();
      break;
    case 'ArrowRight':
      if (hasMultiple.value) showNext();
      break;
    case '+':
    case '=':
      zoomIn();
      break;
    case '-':
    case '_':
      zoomOut();
      break;
    case '0':
      resetTransform();
      break;
    default:
      return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
}

function lockPageScroll() {
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
}

function unlockPageScroll() {
  document.body.style.overflow = previousBodyOverflow;
}

function measureNavbarHeight() {
  const header = document.querySelector('header');
  navbarHeight.value = header?.getBoundingClientRect().height ?? 0;
}

function lockAppInteraction() {
  inertApp = document.getElementById('app');
  inertApp?.setAttribute('inert', '');
}

function unlockAppInteraction() {
  inertApp?.removeAttribute('inert');
  inertApp = null;
}

watch(modelValue, (open) => {
  clearTimers();
  closing.value = false;
  lastTapTime = 0;
  flipTransform.value = null;
  flipClone.value = null;
  cloneTransform.value = '';

  if (open) {
    lastPointerFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    activeIndex.value = clamp(props.initialIndex ?? 0, 0, Math.max(images.value.length - 1, 0));
    resetTransform();
    imageSize.value = { width: 0, height: 0 };
    const startImage = images.value[activeIndex.value];
    flipPending.value = Boolean(startImage && props.originRect && !prefersReducedMotion());
    flipClone.value =
      flipPending.value && startImage && props.originRect
        ? { ...props.originRect, src: startImage.src, alt: startImage.alt }
        : null;
    lockPageScroll();
    lockAppInteraction();
    measureNavbarHeight();
    nextTick(() => dialogRef.value?.focus({ preventScroll: true }));
    return;
  }

  flipPending.value = false;
  unlockPageScroll();
  unlockAppInteraction();
  lastPointerFocus?.focus({ preventScroll: true });
  lastPointerFocus = null;
});

watch(activeIndex, () => {
  resetTransform();
});

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true);
  window.addEventListener('resize', clampOffsets);
  window.addEventListener('resize', measureNavbarHeight);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true);
  window.removeEventListener('resize', clampOffsets);
  window.removeEventListener('resize', measureNavbarHeight);
  clearTimers();
  if (modelValue.value) unlockPageScroll();
  unlockAppInteraction();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="image-viewer">
      <div
        v-if="modelValue"
        ref="dialogRef"
        tabindex="-1"
        class="fixed inset-0 z-120 outline-none"
        :class="closing ? 'pointer-events-none' : ''"
        role="dialog"
        aria-modal="true"
        :aria-label="t('markdown.imageViewer.label')"
      >
        <div
          class="viewer-backdrop absolute inset-0 bg-black/75 transition-opacity duration-200 ease-out"
          :class="closing ? 'opacity-0' : 'opacity-100'"
        />
        <div class="absolute inset-0" :style="{ clipPath: transitionClip }">
          <div
            ref="viewportRef"
            class="absolute inset-0 flex touch-none select-none items-center justify-center overflow-hidden"
            :class="{ 'cursor-grabbing': dragging }"
            @wheel.prevent="onWheel"
            @dblclick.prevent="onDoubleClick"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="releasePointer"
            @pointercancel="releasePointer"
            @click.self="onViewportClick"
          >
            <img
              v-if="currentImage"
              ref="imageRef"
              :src="currentImage.src"
              :alt="currentImage.alt ?? ''"
              class="max-h-[92vh] max-w-[92vw] object-contain will-change-transform"
              :class="[
                dragging ? 'transition-none' : 'transition-transform duration-200 ease-out',
                flipPending ? 'opacity-0' : 'opacity-100',
                dragging ? 'cursor-grabbing' : 'cursor-grab',
              ]"
              draggable="false"
              :style="{ transform: imageTransform }"
              @load="handleImageLoad"
              @dragstart.prevent
            />
          </div>

          <img
            v-if="flipClone"
            :src="flipClone.src"
            :alt="flipClone.alt ?? ''"
            class="flip-clone pointer-events-none absolute object-contain will-change-transform"
            :style="{
              left: `${flipClone.left}px`,
              top: `${flipClone.top}px`,
              width: `${flipClone.width}px`,
              height: `${flipClone.height}px`,
              transform: cloneTransform,
            }"
            draggable="false"
            @dragstart.prevent
          />
        </div>

        <div
          v-show="modelValue && !closing"
          class="viewer-chrome pointer-events-none absolute inset-0"
        >
          <button
            type="button"
            class="border border-white/20 pointer-events-auto absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 backdrop-blur-xl shadow-lg"
            :aria-label="t('markdown.imageViewer.close')"
            :title="t('markdown.imageViewer.close')"
            @click="close"
          >
            <Icon icon="lucide:x" class="h-6 w-6" />
          </button>

          <button
            v-if="hasMultiple"
            type="button"
            class="border border-white/20 pointer-events-auto absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 backdrop-blur-xl shadow-lg"
            :aria-label="t('markdown.imageViewer.previous')"
            :title="t('markdown.imageViewer.previous')"
            @click="showPrevious"
          >
            <Icon icon="lucide:chevron-left" class="h-6 w-6" />
          </button>

          <button
            v-if="hasMultiple"
            type="button"
            class="border border-white/20 pointer-events-auto absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 backdrop-blur-xl shadow-lg"
            :aria-label="t('markdown.imageViewer.next')"
            :title="t('markdown.imageViewer.next')"
            @click="showNext"
          >
            <Icon icon="lucide:chevron-right" class="h-6 w-6" />
          </button>

          <div
            class="border border-white/20 pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/30 px-1 py-1 text-white shadow-lg backdrop-blur-xl"
          >
            <button
              type="button"
              class="inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 disabled:opacity-40"
              :aria-label="t('markdown.imageViewer.zoomOut')"
              :title="t('markdown.imageViewer.zoomOut')"
              :disabled="scale <= MIN_SCALE"
              @click="zoomOut"
            >
              <Icon icon="lucide:minus" class="h-5 w-5" />
            </button>
            <span class="min-w-14 text-center text-xs font-medium tabular-nums"
              >{{ zoomPercent }}%</span
            >
            <button
              type="button"
              class="inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 disabled:opacity-40"
              :aria-label="t('markdown.imageViewer.zoomIn')"
              :title="t('markdown.imageViewer.zoomIn')"
              :disabled="scale >= MAX_SCALE"
              @click="zoomIn"
            >
              <Icon icon="lucide:plus" class="h-5 w-5" />
            </button>
            <button
              type="button"
              class="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 disabled:opacity-40"
              :aria-label="t('markdown.imageViewer.resetZoom')"
              :title="t('markdown.imageViewer.resetZoom')"
              :disabled="scale === 1"
              @click="resetTransform"
            >
              <Icon icon="lucide:rotate-ccw" class="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.image-viewer-enter-from .viewer-backdrop,
.image-viewer-leave-to .viewer-backdrop {
  opacity: 0;
}

.flip-clone {
  transform-origin: center;
  transition: transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .flip-clone {
    transition: none;
  }
}
</style>

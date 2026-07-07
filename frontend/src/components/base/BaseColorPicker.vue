<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';

const model = defineModel<string>({ required: true });

// --- Color math ---
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// --- State ---
const hue = ref(210);
const sat = ref(0.75);
const val = ref(0.9);

const hexInput = ref('');
const rInput = ref('');
const gInput = ref('');
const bInput = ref('');
const hInput = ref('');
const sInput = ref('');
const vInput = ref('');

let syncing = false;

// --- Computed ---
const currentRgb = computed(() => hsvToRgb(hue.value, sat.value, val.value));
const currentHex = computed(() => rgbToHex(...currentRgb.value));

const panelColor = computed(() => {
  const [r, g, b] = hsvToRgb(hue.value, 1, 1);
  return `rgb(${r},${g},${b})`;
});

// --- Sync helpers ---
function syncFromHsv() {
  syncing = true;
  const [r, g, b] = currentRgb.value;
  hexInput.value = currentHex.value;
  rInput.value = Math.round(r).toString();
  gInput.value = Math.round(g).toString();
  bInput.value = Math.round(b).toString();
  hInput.value = Math.round(hue.value).toString();
  sInput.value = Math.round(sat.value * 100).toString();
  vInput.value = Math.round(val.value * 100).toString();
  model.value = currentHex.value;
  syncing = false;
}

function syncFromHex(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
  syncing = true;
  const [r, g, b] = hexToRgb(hex);
  const [h, s, v] = rgbToHsv(r, g, b);
  hue.value = h;
  sat.value = s;
  val.value = v;
  rInput.value = r.toString();
  gInput.value = g.toString();
  bInput.value = b.toString();
  hInput.value = Math.round(h).toString();
  sInput.value = Math.round(s * 100).toString();
  vInput.value = Math.round(v * 100).toString();
  model.value = hex;
  syncing = false;
}

function syncFromRgb(r: number, g: number, b: number) {
  if ([r, g, b].some((v) => isNaN(v) || v < 0 || v > 255)) return;
  syncing = true;
  const [h, s, v] = rgbToHsv(r, g, b);
  hue.value = h;
  sat.value = s;
  val.value = v;
  hexInput.value = rgbToHex(r, g, b);
  hInput.value = Math.round(h).toString();
  sInput.value = Math.round(s * 100).toString();
  vInput.value = Math.round(v * 100).toString();
  model.value = rgbToHex(r, g, b);
  syncing = false;
}

// --- Watch external model ---
watch(
  model,
  (val) => {
    if (syncing) return;
    if (val && /^#[0-9a-f]{6}$/i.test(val)) syncFromHex(val);
  },
  { immediate: true },
);

// --- Panel (saturation + value) drag ---
const panelRef = ref<HTMLDivElement>();
let panelDragging = false;

function updatePanel(e: MouseEvent | TouchEvent) {
  const el = panelRef.value!;
  const rect = el.getBoundingClientRect();
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
  sat.value = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  val.value = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
  syncFromHsv();
}

function onPanelDown(e: MouseEvent | TouchEvent) {
  panelDragging = true;
  updatePanel(e);
  e.preventDefault();
}

// --- Hue strip drag ---
const hueRef = ref<HTMLDivElement>();
let hueDragging = false;

function updateHue(e: MouseEvent | TouchEvent) {
  const el = hueRef.value!;
  const rect = el.getBoundingClientRect();
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
  hue.value = Math.max(0, Math.min(360, ((clientY - rect.top) / rect.height) * 360));
  syncFromHsv();
}

function onHueDown(e: MouseEvent | TouchEvent) {
  hueDragging = true;
  updateHue(e);
  e.preventDefault();
}

function onMove(e: MouseEvent | TouchEvent) {
  if (panelDragging) updatePanel(e);
  if (hueDragging) updateHue(e);
}

function onUp() {
  panelDragging = false;
  hueDragging = false;
}

onMounted(() => {
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMove);
  window.removeEventListener('mouseup', onUp);
  window.removeEventListener('touchmove', onMove);
  window.removeEventListener('touchend', onUp);
});

// --- Input handlers ---
function onHexChange(e: Event) {
  let v = (e.target as HTMLInputElement).value.trim();
  if (!v.startsWith('#')) v = '#' + v;
  hexInput.value = v;
  syncFromHex(v);
}

function commitHex() {
  let v = hexInput.value.trim();
  if (!v.startsWith('#')) v = '#' + v;
  if (/^#[0-9a-f]{6}$/i.test(v)) syncFromHex(v);
  else hexInput.value = currentHex.value;
}

function onRgbInput(channel: 'r' | 'g' | 'b', e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  const n = parseInt(raw);
  if (isNaN(n)) return;
  const [r, g, b] = currentRgb.value;
  if (channel === 'r') syncFromRgb(n, g, b);
  else if (channel === 'g') syncFromRgb(r, n, b);
  else syncFromRgb(r, g, n);
}

function onHsvInput(channel: 'h' | 's' | 'v', e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  const n = parseInt(raw);
  if (isNaN(n)) return;
  if (channel === 'h') {
    hue.value = Math.max(0, Math.min(360, n));
    syncFromHsv();
  } else if (channel === 's') {
    sat.value = Math.max(0, Math.min(100, n)) / 100;
    syncFromHsv();
  } else {
    val.value = Math.max(0, Math.min(100, n)) / 100;
    syncFromHsv();
  }
}

// --- Preset colors ---
const presets = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#78716c',
  '#64748b',
  '#000000',
];
</script>

<template>
  <div class="space-y-3">
    <!-- Picker area -->
    <div class="flex gap-2">
      <!-- Saturation/Value panel -->
      <div
        ref="panelRef"
        class="relative w-full aspect-[4/3] rounded-lg overflow-hidden cursor-crosshair select-none touch-none"
        :style="{ backgroundColor: panelColor }"
        @mousedown="onPanelDown"
        @touchstart.prevent="onPanelDown"
      >
        <!-- White → transparent (saturation) -->
        <div
          class="absolute inset-0"
          style="background: linear-gradient(to right, #fff, transparent)"
        />
        <!-- Transparent → black (value) -->
        <div
          class="absolute inset-0"
          style="background: linear-gradient(to bottom, transparent, #000)"
        />
        <!-- Cursor -->
        <div
          class="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"
          :style="{
            left: sat * 100 + '%',
            top: (1 - val) * 100 + '%',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.4)',
          }"
        />
      </div>

      <!-- Hue strip -->
      <div
        ref="hueRef"
        class="relative w-5 rounded-full overflow-hidden cursor-pointer select-none touch-none"
        style="
          background: linear-gradient(
            to bottom,
            #f00 0%,
            #ff0 17%,
            #0f0 33%,
            #0ff 50%,
            #00f 67%,
            #f0f 83%,
            #f00 100%
          );
        "
        @mousedown="onHueDown"
        @touchstart.prevent="onHueDown"
      >
        <div
          class="absolute left-0 right-0 h-1.5 rounded-full border-2 border-white shadow pointer-events-none -translate-y-1/2"
          :style="{
            top: (hue / 360) * 100 + '%',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.3)',
          }"
        />
      </div>
    </div>

    <!-- Preview + Hex -->
    <div class="flex items-center gap-2">
      <div
        class="w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-700 shrink-0"
        :style="{ backgroundColor: currentHex }"
      />
      <div class="flex-1">
        <input
          :value="hexInput"
          class="w-full px-2.5 py-1.5 text-sm font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-900 dark:text-slate-100"
          placeholder="#3b82f6"
          maxlength="7"
          @input="onHexChange"
          @blur="commitHex"
        />
      </div>
    </div>

    <!-- RGB / HSV inputs -->
    <div class="grid grid-cols-2 gap-2 text-xs">
      <div class="flex items-center gap-1">
        <span class="w-3 text-slate-500 text-right">R</span>
        <input
          :value="rInput"
          class="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-900 dark:text-slate-100 font-mono"
          @input="onRgbInput('r', $event)"
        />
      </div>
      <div class="flex items-center gap-1">
        <span class="w-3 text-slate-500 text-right">H</span>
        <input
          :value="hInput"
          class="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-900 dark:text-slate-100 font-mono"
          @input="onHsvInput('h', $event)"
        />
      </div>
      <div class="flex items-center gap-1">
        <span class="w-3 text-slate-500 text-right">G</span>
        <input
          :value="gInput"
          class="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-900 dark:text-slate-100 font-mono"
          @input="onRgbInput('g', $event)"
        />
      </div>
      <div class="flex items-center gap-1">
        <span class="w-3 text-slate-500 text-right">S</span>
        <input
          :value="sInput"
          class="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-900 dark:text-slate-100 font-mono"
          @input="onHsvInput('s', $event)"
        />
      </div>
      <div class="flex items-center gap-1">
        <span class="w-3 text-slate-500 text-right">B</span>
        <input
          :value="bInput"
          class="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-900 dark:text-slate-100 font-mono"
          @input="onRgbInput('b', $event)"
        />
      </div>
      <div class="flex items-center gap-1">
        <span class="w-3 text-slate-500 text-right">V</span>
        <input
          :value="vInput"
          class="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-900 dark:text-slate-100 font-mono"
          @input="onHsvInput('v', $event)"
        />
      </div>
    </div>

    <!-- Presets -->
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="c in presets"
        :key="c"
        class="w-6 h-6 rounded-md border border-slate-300 dark:border-slate-700 hover:scale-110 transition-transform"
        :style="{ backgroundColor: c }"
        @click="syncFromHex(c)"
      />
    </div>
  </div>
</template>

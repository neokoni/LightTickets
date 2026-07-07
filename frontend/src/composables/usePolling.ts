import { ref, onMounted, onUnmounted } from 'vue';

export function usePolling(fn: () => Promise<void>, intervalMs: number) {
  const active = ref(true);
  let timer: ReturnType<typeof setInterval> | null = null;

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      if (active.value) fn();
    }, intervalMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function onVisibilityChange() {
    if (document.hidden) {
      active.value = false;
    } else {
      active.value = true;
      fn();
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange);
    start();
  });

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    stop();
  });

  return { active, stop };
}

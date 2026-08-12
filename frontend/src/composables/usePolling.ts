import { ref, onMounted, onUnmounted } from 'vue';

export function usePolling(fn: () => Promise<void>, intervalMs: number) {
  const active = ref(true);
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;

  async function poll() {
    if (!active.value || inFlight) return;
    inFlight = true;
    try {
      await fn();
    } catch {
      // Background refresh failures are retried by the next polling interval.
    } finally {
      inFlight = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      void poll();
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
      void poll();
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

import { computed } from 'vue';

export function usePagination(total: () => number, page: () => number, pageSize: () => number) {
  const totalPages = computed(() => Math.ceil(total() / pageSize()) || 1);
  const hasPrev = computed(() => page() > 1);
  const hasNext = computed(() => page() < totalPages.value);

  return { totalPages, hasPrev, hasNext };
}

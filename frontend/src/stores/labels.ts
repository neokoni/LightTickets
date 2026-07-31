import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { CreateLabelPayload, Label, UpdateLabelPayload } from '@/types/label';
import { apiGetLabels, apiCreateLabel, apiUpdateLabel, apiDeleteLabel } from '@/api/labels';

export const useLabelsStore = defineStore('labels', () => {
  const labels = ref<Label[]>([]);
  const loaded = ref(false);
  const loading = ref(false);
  let sessionVersion = 0;

  async function fetchList() {
    const version = sessionVersion;
    loading.value = true;
    try {
      const result = await apiGetLabels();
      if (version === sessionVersion) {
        labels.value = result;
        loaded.value = true;
      }
    } finally {
      if (version === sessionVersion) loading.value = false;
    }
  }

  async function create(data: CreateLabelPayload) {
    const version = sessionVersion;
    const label = await apiCreateLabel(data);
    if (version === sessionVersion) labels.value.push(label);
    return label;
  }

  async function update(id: string, data: UpdateLabelPayload) {
    const version = sessionVersion;
    const label = await apiUpdateLabel(id, data);
    if (version !== sessionVersion) return label;
    const idx = labels.value.findIndex((l) => l.id === id);
    if (idx !== -1) labels.value[idx] = label;
    return label;
  }

  async function remove(id: string) {
    const version = sessionVersion;
    await apiDeleteLabel(id);
    if (version === sessionVersion) labels.value = labels.value.filter((l) => l.id !== id);
  }

  function clearSessionState() {
    sessionVersion++;
    labels.value = [];
    loaded.value = false;
    loading.value = false;
  }

  return { labels, loaded, loading, fetchList, create, update, remove, clearSessionState };
});

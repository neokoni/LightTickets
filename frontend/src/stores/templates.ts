import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AdminTemplate } from '@/types/template';
import {
  apiGetAdminTemplates,
  apiCreateAdminTemplate,
  apiUpdateAdminTemplate,
  apiDeleteAdminTemplate,
} from '@/api/templates';

export const useTemplatesStore = defineStore('templates', () => {
  const templates = ref<AdminTemplate[]>([]);
  const loaded = ref(false);
  let sessionVersion = 0;

  async function fetchList() {
    const version = sessionVersion;
    const result = await apiGetAdminTemplates();
    if (version === sessionVersion) {
      templates.value = result;
      loaded.value = true;
    }
  }

  async function create(data: Parameters<typeof apiCreateAdminTemplate>[0]) {
    const version = sessionVersion;
    const tmpl = await apiCreateAdminTemplate(data);
    if (version === sessionVersion) templates.value.push(tmpl);
    return tmpl;
  }

  async function update(name: string, data: Parameters<typeof apiUpdateAdminTemplate>[1]) {
    const version = sessionVersion;
    const tmpl = await apiUpdateAdminTemplate(name, data);
    if (version !== sessionVersion) return tmpl;
    const idx = templates.value.findIndex((t) => t.name === name);
    if (idx !== -1) templates.value[idx] = tmpl;
    return tmpl;
  }

  async function remove(name: string) {
    const version = sessionVersion;
    await apiDeleteAdminTemplate(name);
    if (version === sessionVersion) {
      templates.value = templates.value.filter((t) => t.name !== name);
    }
  }

  function clearSessionState() {
    sessionVersion++;
    templates.value = [];
    loaded.value = false;
  }

  return { templates, loaded, fetchList, create, update, remove, clearSessionState };
});

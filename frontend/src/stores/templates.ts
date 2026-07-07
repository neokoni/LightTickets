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

  async function fetchList() {
    templates.value = await apiGetAdminTemplates();
    loaded.value = true;
  }

  async function create(data: Parameters<typeof apiCreateAdminTemplate>[0]) {
    const tmpl = await apiCreateAdminTemplate(data);
    templates.value.push(tmpl);
    return tmpl;
  }

  async function update(name: string, data: Parameters<typeof apiUpdateAdminTemplate>[1]) {
    const tmpl = await apiUpdateAdminTemplate(name, data);
    const idx = templates.value.findIndex((t) => t.name === name);
    if (idx !== -1) templates.value[idx] = tmpl;
    return tmpl;
  }

  async function remove(name: string) {
    await apiDeleteAdminTemplate(name);
    templates.value = templates.value.filter((t) => t.name !== name);
  }

  return { templates, loaded, fetchList, create, update, remove };
});

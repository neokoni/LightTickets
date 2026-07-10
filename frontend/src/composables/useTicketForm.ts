import { ref, computed } from 'vue';
import type { TemplateSummary, TemplateDefinition, TemplateField } from '@/types/ticket';
import { apiGetTemplates, apiGetTemplate } from '@/api/tickets';

export function useTicketForm() {
  const step = ref<1 | 2>(1);
  const templates = ref<TemplateSummary[]>([]);
  const selectedTemplateName = ref<string | null>(null);
  const selectedTemplate = ref<TemplateDefinition | null>(null);
  const formValues = ref<Record<string, string>>({});
  const title = ref('');
  const loading = ref(false);

  const currentTemplateSummary = computed(() =>
    templates.value.find((t) => t.name === selectedTemplateName.value),
  );

  async function fetchTemplates() {
    templates.value = await apiGetTemplates();
  }

  async function selectTemplate(name: string) {
    selectedTemplateName.value = name;
    selectedTemplate.value = await apiGetTemplate(name);
    formValues.value = {};
    title.value = '';
    step.value = 2;
  }

  function setFieldValue(fieldId: string, value: string) {
    formValues.value = { ...formValues.value, [fieldId]: value };
  }

  function setCheckboxValue(fieldId: string, label: string, checked: boolean) {
    const current = (formValues.value[fieldId] || '').split(',').filter(Boolean);
    if (checked) {
      current.push(label);
    } else {
      const idx = current.indexOf(label);
      if (idx >= 0) current.splice(idx, 1);
    }
    formValues.value[fieldId] = current.join(',');
  }

  function isFieldValid(field: TemplateField): boolean {
    if (field.type === 'markdown') return true;
    if (!field.validations?.required) return true;
    const val = formValues.value[field.id!] || '';
    return val.trim().length > 0;
  }

  const allFieldsValid = computed(() => {
    if (!selectedTemplate.value) return false;
    return selectedTemplate.value.body.every(isFieldValid);
  });

  function goToStep(n: 1 | 2) {
    step.value = n;
  }

  function reset() {
    step.value = 1;
    selectedTemplateName.value = null;
    selectedTemplate.value = null;
    formValues.value = {};
    title.value = '';
  }

  return {
    step,
    templates,
    selectedTemplateName,
    selectedTemplate,
    formValues,
    title,
    loading,
    currentTemplateSummary,
    fetchTemplates,
    selectTemplate,
    setFieldValue,
    setCheckboxValue,
    isFieldValid,
    allFieldsValid,
    goToStep,
    reset,
  };
}

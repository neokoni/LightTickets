import { ref, computed, nextTick, watch, type Ref, type ComponentPublicInstance } from 'vue';
import { useTicketsStore } from '@/stores/tickets';
import { useUiStore } from '@/stores/ui';
import { useMarkdownUpload } from '@/composables/useMarkdownUpload';
import { handleError } from '@/utils/error';
import { t } from '@/i18n';
import { diffLines } from 'diff';
import type { Ticket, AuditLog } from '@/types/ticket';

export function useTicketEdit(
  ticket: Ref<Ticket | null>,
  onAuditRefresh: () => Promise<void>,
  titleInputRef: Ref<ComponentPublicInstance<{ focus: () => void }> | null>,
  bodyTextareaRef: Ref<ComponentPublicInstance | null>,
) {
  const store = useTicketsStore();
  const ui = useUiStore();

  const editingTitle = ref(false);
  const editTitleValue = ref('');

  const editingBody = ref(false);
  const editBodyValue = ref('');
  const bodyUpload = useMarkdownUpload();

  const expandedBodyDiff = ref<string | null>(null);
  const diffOld = ref('');
  const diffNew = ref('');

  const diffResult = computed(() => diffLines(diffOld.value, diffNew.value));

  function startEditTitle() {
    if (!ticket.value) return;
    editTitleValue.value = ticket.value.title;
    editingTitle.value = true;
    nextTick(() => titleInputRef.value?.focus());
  }

  async function saveTitle() {
    if (!ticket.value || !editTitleValue.value.trim()) return;
    try {
      await store.updateTitle(ticket.value.id, editTitleValue.value.trim());
      editingTitle.value = false;
      await onAuditRefresh();
      ui.toast(t('ticket.detail.titleUpdated'), 'success');
    } catch (e) {
      handleError(e);
    }
  }

  function cancelEditTitle() {
    editingTitle.value = false;
  }

  function startEditBody() {
    if (!ticket.value) return;
    editBodyValue.value = ticket.value.body;
    editingBody.value = true;
  }

  async function saveBody() {
    if (!ticket.value) return;
    try {
      let body = editBodyValue.value;
      if (bodyUpload.pendingFiles.value.size > 0) {
        body = await bodyUpload.uploadAndReplace(body, ticket.value.id);
      }
      await store.updateBody(ticket.value.id, body);
      editingBody.value = false;
      await onAuditRefresh();
      ui.toast(t('ticket.detail.bodyUpdated'), 'success');
    } catch (e) {
      handleError(e);
    }
  }

  function cancelEditBody() {
    editingBody.value = false;
  }

  function toggleDiff(item: AuditLog) {
    if (expandedBodyDiff.value === item.id) {
      expandedBodyDiff.value = null;
    } else {
      diffOld.value = item.oldValue || '';
      diffNew.value = item.newValue || '';
      expandedBodyDiff.value = item.id;
    }
  }

  function onBodyFileDrop(e: DragEvent) {
    const textarea = bodyTextareaRef.value?.$el?.querySelector('textarea') as HTMLTextAreaElement;
    if (!textarea) return;
    bodyUpload.handleDrop(e, textarea, editBodyValue);
  }

  function onBodyFilePaste(e: ClipboardEvent) {
    const textarea = bodyTextareaRef.value?.$el?.querySelector('textarea') as HTMLTextAreaElement;
    if (!textarea) return;
    bodyUpload.handlePaste(e, textarea, editBodyValue);
  }

  watch(editBodyValue, (val) => {
    bodyUpload.syncPending(val);
  });

  return {
    editingTitle,
    editTitleValue,
    editingBody,
    editBodyValue,
    bodyUpload,
    expandedBodyDiff,
    diffResult,
    startEditTitle,
    saveTitle,
    cancelEditTitle,
    startEditBody,
    saveBody,
    cancelEditBody,
    toggleDiff,
    onBodyFileDrop,
    onBodyFilePaste,
  };
}

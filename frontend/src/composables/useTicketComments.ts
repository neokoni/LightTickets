import { ref, watch, nextTick, type ComponentPublicInstance, type Ref } from 'vue';
import { useMarkdownUpload } from '@/composables/useMarkdownUpload';
import { ToastType, useUiStore } from '@/stores/ui';
import { renderTicketRefs } from '@/utils/ticketRef';
import { handleError } from '@/utils/error';
import { t } from '@/i18n';
import { apiGetComments, apiCreateComment, apiUpdateCommentBody } from '@/api/comments';
import type { Comment } from '@/types/ticket';

export function useTicketComments(
  ticketId: number,
  onAuditRefresh: () => Promise<void>,
  commentTextareaRef: Ref<ComponentPublicInstance | null>,
) {
  const ui = useUiStore();
  const comments = ref<Comment[]>([]);
  const newComment = ref('');
  const submitting = ref(false);
  const mdUpload = useMarkdownUpload();

  const editingCommentId = ref<string | null>(null);
  const editCommentValue = ref('');
  const savingComment = ref(false);
  const commentRawBodies = ref<Record<string, string>>({});

  async function fetchComments() {
    const raw = await apiGetComments(ticketId);
    const rawMap: Record<string, string> = {};
    for (const c of raw) {
      rawMap[c.id] = c.body;
    }
    commentRawBodies.value = rawMap;
    comments.value = raw.map((c) => ({ ...c, body: renderTicketRefs(c.body) }));
  }

  async function postComment() {
    if (!newComment.value.trim()) return;
    let body = newComment.value;
    if (mdUpload.pendingFiles.value.size > 0) {
      body = await mdUpload.uploadAndReplace(body, ticketId);
    }
    const comment = await apiCreateComment(ticketId, body);
    commentRawBodies.value[comment.id] = comment.body;
    comments.value.push({ ...comment, body: renderTicketRefs(comment.body) });
    newComment.value = '';
  }

  async function submitComment() {
    if (!newComment.value.trim()) return;
    submitting.value = true;
    try {
      await postComment();
    } catch (e) {
      handleError(e, t('ticket.comments.failed'));
    } finally {
      submitting.value = false;
    }
  }

  function startEditComment(comment: Comment) {
    editingCommentId.value = comment.id;
    editCommentValue.value = commentRawBodies.value[comment.id] || comment.body;
  }

  function cancelEditComment() {
    editingCommentId.value = null;
    editCommentValue.value = '';
  }

  async function saveEditComment(commentId: string) {
    if (!editCommentValue.value.trim()) return;
    savingComment.value = true;
    try {
      const updated = await apiUpdateCommentBody(ticketId, commentId, editCommentValue.value);
      const idx = comments.value.findIndex((c) => c.id === commentId);
      if (idx !== -1) {
        comments.value[idx] = { ...updated, body: renderTicketRefs(updated.body) };
      }
      commentRawBodies.value[commentId] = updated.body;
      editingCommentId.value = null;
      editCommentValue.value = '';
      await onAuditRefresh();
    } catch (e) {
      handleError(e);
    } finally {
      savingComment.value = false;
    }
  }

  function quoteComment(comment: Comment) {
    const body = commentRawBodies.value[comment.id] || comment.body;
    const quoted = body
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    newComment.value = newComment.value ? `${newComment.value}\n\n${quoted}\n\n` : `${quoted}\n\n`;
    nextTick(() => {
      const textarea = commentTextareaRef.value?.$el?.querySelector(
        'textarea',
      ) as HTMLTextAreaElement;
      if (textarea) textarea.focus();
    });
  }

  async function copyCommentLink(commentId: string) {
    const url = `${window.location.origin}${window.location.pathname}#comment-${commentId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    ui.toast(t('common.linkCopied'), ToastType.SUCCESS);
  }

  function scrollToComment(commentId: string) {
    const el = document.getElementById(`comment-${commentId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-slate-400/50', 'dark:ring-slate-500/50', 'rounded-lg');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-slate-400/50', 'dark:ring-slate-500/50', 'rounded-lg');
      }, 2000);
    }
  }

  function onCommentFileDrop(e: DragEvent) {
    const textarea = commentTextareaRef.value?.$el?.querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    if (!textarea) return;
    mdUpload.handleDrop(e, textarea, newComment);
  }

  function onCommentFilePaste(e: ClipboardEvent) {
    const textarea = commentTextareaRef.value?.$el?.querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    if (!textarea) return;
    mdUpload.handlePaste(e, textarea, newComment);
  }

  watch(newComment, (val) => {
    mdUpload.syncPending(val);
  });

  return {
    comments,
    newComment,
    submitting,
    mdUpload,
    editingCommentId,
    editCommentValue,
    savingComment,
    commentRawBodies,
    fetchComments,
    postComment,
    submitComment,
    startEditComment,
    cancelEditComment,
    saveEditComment,
    quoteComment,
    copyCommentLink,
    scrollToComment,
    onCommentFileDrop,
    onCommentFilePaste,
  };
}

import { ref } from 'vue';
import { apiUploadAttachment } from '@/api/attachments';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export interface PendingFile {
  objectUrl: string;
  file: File;
}

export function useMarkdownUpload() {
  const pendingFiles = ref<Map<string, File>>(new Map());
  const isDragging = ref(false);

  function filterImageFiles(files: FileList | File[]): File[] {
    return Array.from(files).filter((f) => IMAGE_TYPES.includes(f.type));
  }

  function insertAtCursor(
    textarea: HTMLTextAreaElement,
    text: string,
    modelValue: { value: string },
  ) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = modelValue.value.substring(0, start);
    const after = modelValue.value.substring(end);
    modelValue.value = before + text + after;
    setTimeout(() => {
      textarea.focus();
      const newPos = start + text.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  }

  function handleDrop(e: DragEvent, textarea: HTMLTextAreaElement, modelValue: { value: string }) {
    e.preventDefault();
    isDragging.value = false;
    if (!e.dataTransfer?.files) return;

    const images = filterImageFiles(e.dataTransfer.files);
    if (images.length === 0) return;

    const parts: string[] = [];
    for (const file of images) {
      const url = URL.createObjectURL(file);
      pendingFiles.value.set(url, file);
      parts.push(`![](${url})`);
    }
    insertAtCursor(textarea, parts.join('\n'), modelValue);
  }

  function handlePaste(
    e: ClipboardEvent,
    textarea: HTMLTextAreaElement,
    modelValue: { value: string },
  ) {
    if (!e.clipboardData?.files?.length) return;

    const images = filterImageFiles(e.clipboardData.files);
    if (images.length === 0) return;

    e.preventDefault();
    const parts: string[] = [];
    for (const file of images) {
      const url = URL.createObjectURL(file);
      pendingFiles.value.set(url, file);
      parts.push(`![](${url})`);
    }
    insertAtCursor(textarea, parts.join('\n'), modelValue);
  }

  function removePending(objectUrl: string) {
    URL.revokeObjectURL(objectUrl);
    pendingFiles.value.delete(objectUrl);
  }

  async function uploadAndReplace(text: string, ticketId: number): Promise<string> {
    let result = text;
    const entries = Array.from(pendingFiles.value.entries());

    const uploads = entries.map(async ([objectUrl, file]) => {
      const attachment = await apiUploadAttachment(file, { ticketId });
      result = result.replaceAll(objectUrl, `/api/attachments/${attachment.id}`);
      URL.revokeObjectURL(objectUrl);
    });

    await Promise.all(uploads);
    pendingFiles.value.clear();
    return result;
  }

  function syncPending(text: string) {
    for (const [url] of pendingFiles.value) {
      if (!text.includes(url)) {
        URL.revokeObjectURL(url);
        pendingFiles.value.delete(url);
      }
    }
  }

  function cleanup() {
    for (const url of pendingFiles.value.keys()) {
      URL.revokeObjectURL(url);
    }
    pendingFiles.value.clear();
  }

  return {
    pendingFiles,
    isDragging,
    handleDrop,
    handlePaste,
    removePending,
    uploadAndReplace,
    syncPending,
    cleanup,
  };
}

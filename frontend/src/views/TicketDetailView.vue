<script setup lang="ts">
import { ref, watch, onMounted, computed, nextTick, type ComponentPublicInstance } from 'vue';
import { useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useTicketsStore } from '@/stores/tickets';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { useLabelsStore } from '@/stores/labels';
import { usePolling } from '@/composables/usePolling';
import { handleError } from '@/utils/error';
import { renderTicketRefs } from '@/utils/ticketRef';
import { timeAgo, formatDate } from '@/utils/date';
import BaseBadge from '@/components/base/BaseBadge.vue';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseCheckbox from '@/components/base/BaseCheckbox.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseModal from '@/components/base/BaseModal.vue';
import BaseTextarea from '@/components/base/BaseTextarea.vue';
import UserAvatar from '@/components/base/UserAvatar.vue';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer.vue';
import TicketLabels from '@/components/tickets/TicketLabels.vue';
import type { TicketStatus, GameContext, Role } from '@/types/ticket';
import { STATUS_META } from '@/types/ticket';
import { ROLE_META } from '@/types/user';
import { AUDIT_ACTION } from '@/types/audit';
import { apiGetTemplates } from '@/api/tickets';
import { useAssignees } from '@/composables/useAssignees';
import { useTicketComments } from '@/composables/useTicketComments';
import { useTicketEdit } from '@/composables/useTicketEdit';
import { useAuditTimeline } from '@/composables/useAuditTimeline';

const route = useRoute();
const store = useTicketsStore();
const auth = useAuthStore();
const ui = useUiStore();
const labels = useLabelsStore();

const id = Number(route.params.id);
const ticket = computed(() => store.currentTicket);

const commentTextareaRef = ref<ComponentPublicInstance | null>(null);
const titleInputRef = ref<ComponentPublicInstance<{ focus: () => void }> | null>(null);
const bodyTextareaRef = ref<ComponentPublicInstance | null>(null);

const templateMap = ref<Record<string, string>>({});
const iconButtonClass =
  '!px-1 !py-1 border-none text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
const tinyIconButtonClass = '!px-0 !py-0 border-none text-slate-400 hover:text-red-500';
const linkButtonClass =
  '!px-0 !py-0 border-none text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline';
const inlineActionButtonClass =
  '!px-0 !py-0 border-none text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300';

async function fetchTemplateNames() {
  try {
    const list = await apiGetTemplates();
    for (const t of list) {
      templateMap.value[t.name] = t.name_i18n;
    }
  } catch {
    /* ignore */
  }
}

function templateName(template: string): string {
  return templateMap.value[template] || template;
}

const ticketBody = computed(() => (ticket.value ? renderTicketRefs(ticket.value.body) : ''));
const ticketSourceLabel = computed(() => (ticket.value?.serverId ? 'Minecraft' : '网页'));

const gameModeLabels: Record<string, string> = {
  survival: '生存模式',
  creative: '创造模式',
  adventure: '冒险模式',
  spectator: '观察模式',
};

const gameContext = computed<GameContext | null>(() => {
  if (!ticket.value?.gameContext) return null;
  try {
    return JSON.parse(ticket.value.gameContext) as GameContext;
  } catch {
    return null;
  }
});

let fetchAuditLogs: () => Promise<void> = async () => {};

const commentsComposable = useTicketComments(id, () => fetchAuditLogs(), commentTextareaRef);
const {
  comments,
  newComment,
  submitting,
  mdUpload,
  editingCommentId,
  editCommentValue,
  savingComment,
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
} = commentsComposable;

const {
  assignableUsers,
  showAssignPicker,
  assignSearch,
  selectedAssigneeIds,
  assigning,
  filteredAssignableUsers,
  fetchAssignableUsers,
  openAssignPicker,
  toggleAssignee,
  saveAssignees,
} = useAssignees(() => ticket.value);

const auditTimeline = useAuditTimeline(id, comments, ticket, assignableUsers);
fetchAuditLogs = auditTimeline.fetchAuditLogs;
const { timeline, isComment, eventLabel, parseLabelData, eventIcon } = auditTimeline;

const {
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
} = useTicketEdit(ticket, () => fetchAuditLogs(), titleInputRef, bodyTextareaRef);

const statusOptions: { key: TicketStatus; label: string; icon: string; color: string }[] =
  Object.entries(STATUS_META).map(([key, { label, icon, color }]) => ({
    key: key as TicketStatus,
    label,
    icon,
    color,
  }));

const visibleStatusOptions = computed(() => {
  if (!ticket.value) return [];
  if (!auth.isStaff) return [];
  return statusOptions.filter((s) => s.key !== ticket.value!.status);
});

async function changeStatus(status: TicketStatus) {
  try {
    await store.updateStatus(id, status);
    ui.toast('状态已更新', 'success');
  } catch (e) {
    handleError(e);
  }
}

async function closeTicket() {
  submitting.value = true;
  try {
    if (newComment.value.trim()) {
      await postComment();
    }
    await store.closeTicket(id);
    await fetchAuditLogs();
    ui.toast('议题已关闭', 'success');
  } catch (e) {
    handleError(e);
  } finally {
    submitting.value = false;
  }
}

async function reopenTicket() {
  submitting.value = true;
  try {
    if (newComment.value.trim()) {
      await postComment();
    }
    await store.reopenTicket(id);
    await fetchAuditLogs();
    ui.toast('议题已重新打开', 'success');
  } catch (e) {
    handleError(e);
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  fetchTemplateNames();
  fetchAssignableUsers();
  if (!labels.loaded) labels.fetchList().catch(() => {});
  await Promise.all([store.fetchDetail(id), fetchComments(), fetchAuditLogs()]);
  if (route.hash && route.hash.startsWith('#comment-')) {
    const commentId = route.hash.slice('#comment-'.length);
    nextTick(() => scrollToComment(commentId));
  }
});

usePolling(async () => {
  await Promise.all([store.fetchDetail(id), fetchComments(), fetchAuditLogs()]);
}, 10000);

watch(
  () => route.hash,
  (hash) => {
    if (hash && hash.startsWith('#comment-')) {
      const commentId = hash.slice('#comment-'.length);
      nextTick(() => scrollToComment(commentId));
    }
  },
);
</script>

<template>
  <div v-if="!ticket" class="py-12 text-center text-slate-400">
    <Icon icon="lucide:loader-2" class="w-6 h-6 mx-auto animate-spin" />
  </div>

  <div v-else class="space-y-6">
    <!-- Header (full width, like GitHub issue title) -->
    <div>
      <div v-if="!editingTitle" class="group flex items-center gap-2">
        <span class="text-xl tracking-tight text-slate-400 dark:text-slate-500 sm:text-2xl"
          >#{{ ticket.id }}</span
        >
        <h1 class="text-3xl tracking-tight text-slate-950 dark:text-white sm:text-4xl">
          {{ ticket.title }}
        </h1>
        <BaseButton
          v-if="ticket.authorId === auth.user?.id || auth.isStaff"
          :class="['opacity-0 group-hover:opacity-100', iconButtonClass]"
          @click="startEditTitle"
        >
          <Icon icon="lucide:pencil" class="w-4 h-4" />
        </BaseButton>
      </div>
      <div v-else class="flex items-center gap-2">
        <BaseInput
          ref="titleInputRef"
          v-model="editTitleValue"
          class="flex-1 [&_input]:text-3xl [&_input]:font-bold [&_input]:tracking-tight [&_input]:text-slate-950 dark:[&_input]:text-white sm:[&_input]:text-4xl [&_input]:bg-transparent [&_input]:border-x-0 [&_input]:border-t-0 [&_input]:rounded-none [&_input]:px-0 [&_input]:border-b-2 [&_input]:border-slate-300 dark:[&_input]:border-slate-600 [&_input]:focus:border-slate-500 dark:[&_input]:focus:border-slate-400 [&_input]:pb-1"
          @keydown.enter="saveTitle"
          @keydown.escape="cancelEditTitle"
        />
        <BaseButton size="sm" @click="saveTitle">保存</BaseButton>
        <BaseButton size="sm" @click="cancelEditTitle">取消</BaseButton>
      </div>
      <div class="mt-2 flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
        <span>{{ ticket.author.username }}</span>
        <span :title="formatDate(ticket.createdAt)">{{ timeAgo(ticket.createdAt) }}</span>
        <BaseBadge v-for="tl in ticket.labels" :key="tl.labelId" :color="tl.label.color">{{
          tl.label.name
        }}</BaseBadge>
      </div>
    </div>

    <!-- Content + Sidebar (two columns below title) -->
    <div class="flex flex-col lg:flex-row lg:items-start gap-6">
      <!-- Main content -->
      <div class="flex-1 min-w-0 space-y-6">
        <!-- Body -->
        <div
          class="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur"
        >
          <div v-if="!editingBody">
            <div
              v-if="ticket.authorId === auth.user?.id || auth.isStaff"
              class="flex justify-end px-6 pt-4"
            >
              <BaseButton :class="linkButtonClass" @click="startEditBody">
                <Icon icon="lucide:pencil" class="w-3 h-3" />
                编辑
              </BaseButton>
            </div>
            <div class="p-6">
              <MarkdownRenderer :content="ticketBody" />
            </div>
          </div>
          <div v-else class="p-6 space-y-3">
            <BaseTextarea
              ref="bodyTextareaRef"
              v-model="editBodyValue"
              :rows="12"
              uploadable
              previewable
              @file-drop="onBodyFileDrop"
              @file-paste="onBodyFilePaste"
            />
            <div v-if="bodyUpload.pendingFiles.value.size > 0" class="flex flex-wrap gap-2">
              <div
                v-for="[url, file] in bodyUpload.pendingFiles.value"
                :key="url"
                class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <Icon icon="lucide:image" class="w-3 h-3 text-slate-400" />
                <span class="text-slate-600 dark:text-slate-300 truncate max-w-[120px]">{{
                  file.name
                }}</span>
                <BaseButton
                  type="button"
                  :class="tinyIconButtonClass"
                  @click="bodyUpload.removePending(url)"
                >
                  <Icon icon="lucide:x" class="w-3 h-3" />
                </BaseButton>
              </div>
            </div>
            <div class="flex justify-end gap-2">
              <BaseButton size="sm" @click="saveBody">保存</BaseButton>
              <BaseButton size="sm" @click="cancelEditBody">取消</BaseButton>
            </div>
          </div>
        </div>

        <!-- Comments -->
        <div class="space-y-4">
          <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
            评论 ({{ comments.length }})
          </h2>

          <div v-for="item in timeline" :key="item.id + ('body' in item ? '-comment' : '-audit')">
            <!-- Comment -->
            <div
              v-if="isComment(item)"
              :id="`comment-${item.id}`"
              class="group flex gap-3 mb-4 scroll-mt-24"
            >
              <div class="w-8 h-8 shrink-0">
                <UserAvatar :username="item.author.username" :avatar-url="item.author.avatarUrl" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2 text-sm">
                    <span class="font-medium text-slate-900 dark:text-white">{{
                      item.author.username
                    }}</span>
                    <span class="text-slate-400 text-xs">{{ timeAgo(item.createdAt) }}</span>
                    <BaseBadge v-if="item.source === 'minecraft'" color="#4ade80">MC</BaseBadge>
                  </div>
                  <div
                    v-if="auth.isAuthenticated && editingCommentId !== item.id"
                    class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition"
                  >
                    <BaseButton
                      :class="iconButtonClass"
                      title="引用回复"
                      @click="quoteComment(item)"
                    >
                      <Icon icon="lucide:text-quote" class="w-3.5 h-3.5" />
                    </BaseButton>
                    <BaseButton
                      v-if="item.authorId === auth.user?.id || auth.isStaff"
                      :class="iconButtonClass"
                      title="编辑"
                      @click="startEditComment(item)"
                    >
                      <Icon icon="lucide:pencil" class="w-3.5 h-3.5" />
                    </BaseButton>
                    <BaseButton
                      :class="iconButtonClass"
                      title="复制链接"
                      @click="copyCommentLink(item.id)"
                    >
                      <Icon icon="lucide:link" class="w-3.5 h-3.5" />
                    </BaseButton>
                  </div>
                </div>
                <div
                  v-if="editingCommentId !== item.id"
                  class="mt-1 text-sm text-slate-700 dark:text-slate-300"
                >
                  <MarkdownRenderer :content="item.body" />
                </div>
                <div v-else class="mt-2 space-y-2">
                  <BaseTextarea v-model="editCommentValue" :rows="4" uploadable previewable />
                  <div class="flex justify-end gap-2">
                    <BaseButton size="sm" :loading="savingComment" @click="saveEditComment(item.id)"
                      >保存</BaseButton
                    >
                    <BaseButton size="sm" @click="cancelEditComment">取消</BaseButton>
                  </div>
                </div>
              </div>
            </div>

            <!-- Audit event -->
            <div v-else class="py-2 text-sm text-slate-500 dark:text-slate-400">
              <div class="flex items-center gap-2">
                <Icon
                  :icon="eventIcon(item)"
                  class="w-3.5 h-3.5 shrink-0"
                  :class="
                    item.action === AUDIT_ACTION.STATUS_CHANGE && item.newValue
                      ? STATUS_META[item.newValue as TicketStatus]?.color || 'text-slate-400'
                      : ''
                  "
                />
                <span class="font-medium text-slate-600 dark:text-slate-300">{{
                  item.actor.username
                }}</span>
                <span>{{ eventLabel(item) }}</span>
                <span
                  v-if="
                    (item.action === AUDIT_ACTION.LABEL_ADD ||
                      item.action === AUDIT_ACTION.LABEL_REMOVE) &&
                    parseLabelData(
                      item.action === AUDIT_ACTION.LABEL_ADD ? item.newValue : item.oldValue,
                    )
                  "
                  class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full"
                  :style="{
                    backgroundColor:
                      parseLabelData(
                        item.action === AUDIT_ACTION.LABEL_ADD ? item.newValue : item.oldValue,
                      )!.color + '22',
                    color: parseLabelData(
                      item.action === AUDIT_ACTION.LABEL_ADD ? item.newValue : item.oldValue,
                    )!.color,
                  }"
                >
                  {{
                    parseLabelData(
                      item.action === AUDIT_ACTION.LABEL_ADD ? item.newValue : item.oldValue,
                    )!.name
                  }}
                </span>
                <span class="text-xs text-slate-400">{{ timeAgo(item.createdAt) }}</span>
              </div>
              <!-- Title change: inline strikethrough old → new -->
              <div
                v-if="item.action === AUDIT_ACTION.TITLE_CHANGE"
                class="ml-5.5 mt-1 flex items-center gap-1.5 text-sm"
              >
                <span class="line-through text-slate-400">{{ item.oldValue }}</span>
                <Icon icon="lucide:arrow-right" class="w-3 h-3 text-slate-400 shrink-0" />
                <span class="text-slate-700 dark:text-slate-200">{{ item.newValue }}</span>
              </div>
              <!-- Body/comment change: expandable inline diff -->
              <div
                v-else-if="
                  item.action === AUDIT_ACTION.BODY_CHANGE ||
                  item.action === AUDIT_ACTION.COMMENT_EDIT
                "
                class="ml-5.5 mt-1"
              >
                <BaseButton :class="linkButtonClass" @click="toggleDiff(item)">
                  {{ expandedBodyDiff === item.id ? '收起变更' : '查看变更' }}
                </BaseButton>
                <div
                  v-if="expandedBodyDiff === item.id"
                  class="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 overflow-hidden"
                >
                  <div
                    class="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900"
                  >
                    <span class="text-xs text-slate-500">{{
                      item.action === AUDIT_ACTION.COMMENT_EDIT ? '评论变更详情' : '内容变更详情'
                    }}</span>
                    <BaseButton :class="iconButtonClass" @click="expandedBodyDiff = null">
                      <Icon icon="lucide:x" class="w-3.5 h-3.5" />
                    </BaseButton>
                  </div>
                  <div class="max-h-[60vh] overflow-y-auto font-mono text-xs leading-relaxed">
                    <div v-for="(part, i) in diffResult" :key="i">
                      <div
                        v-for="(line, j) in part.value
                          .split('\n')
                          .filter((l, k, arr) => !(k === arr.length - 1 && l === ''))"
                        :key="j"
                        class="px-3 py-0.5"
                        :class="{
                          'bg-red-500/10 text-red-400': part.removed,
                          'bg-green-500/10 text-green-400': part.added,
                          'text-slate-500 dark:text-slate-400': !part.removed && !part.added,
                        }"
                      >
                        <span class="inline-block w-4 text-right mr-2 select-none text-slate-400">
                          {{ part.removed ? '-' : part.added ? '+' : ' ' }} </span
                        >{{ line }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <!-- Other actions: old → new inline -->
              <div
                v-else-if="
                  item.action !== AUDIT_ACTION.STATUS_CHANGE &&
                  item.action !== AUDIT_ACTION.LABEL_ADD &&
                  item.action !== AUDIT_ACTION.LABEL_REMOVE &&
                  item.action !== AUDIT_ACTION.ASSIGNEES_CHANGE &&
                  (item.oldValue || item.newValue)
                "
                class="ml-5.5 mt-1 flex items-center gap-1"
              >
                <span v-if="item.oldValue" class="line-through opacity-60">{{
                  item.oldValue
                }}</span>
                <Icon
                  v-if="item.oldValue && item.newValue"
                  icon="lucide:arrow-right"
                  class="w-3 h-3"
                />
                <span v-if="item.newValue">{{ item.newValue }}</span>
              </div>
            </div>
          </div>

          <!-- Comment form -->
          <form v-if="auth.isAuthenticated" class="space-y-3" @submit.prevent="submitComment">
            <BaseTextarea
              ref="commentTextareaRef"
              v-model="newComment"
              placeholder="添加评论... (支持 Markdown)"
              :rows="3"
              uploadable
              previewable
              @file-drop="onCommentFileDrop"
              @file-paste="onCommentFilePaste"
            />
            <div v-if="mdUpload.pendingFiles.value.size > 0" class="flex flex-wrap gap-2">
              <div
                v-for="[url, file] in mdUpload.pendingFiles.value"
                :key="url"
                class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <Icon icon="lucide:image" class="w-3 h-3 text-slate-400" />
                <span class="text-slate-600 dark:text-slate-300 truncate max-w-[120px]">{{
                  file.name
                }}</span>
                <BaseButton
                  type="button"
                  :class="tinyIconButtonClass"
                  @click="mdUpload.removePending(url)"
                >
                  <Icon icon="lucide:x" class="w-3 h-3" />
                </BaseButton>
              </div>
            </div>
            <div class="flex justify-end items-center gap-1.5">
              <BaseButton
                v-if="
                  ticket.authorId === auth.user?.id &&
                  (ticket.status === 'open' || ticket.status === 'in_progress')
                "
                type="button"
                size="sm"
                icon="lucide:check-circle-2"
                @click="closeTicket"
              >
                {{ newComment.trim() ? '评论并关闭' : '关闭议题' }}
              </BaseButton>
              <BaseButton
                v-if="
                  auth.isStaff &&
                  (ticket.status === 'open' || ticket.status === 'in_progress') &&
                  ticket.authorId !== auth.user?.id
                "
                type="button"
                size="sm"
                icon="lucide:check-circle-2"
                @click="closeTicket"
              >
                {{ newComment.trim() ? '评论并已完成关闭' : '已完成关闭' }}
              </BaseButton>
              <BaseButton
                v-if="
                  (ticket.authorId === auth.user?.id && ticket.status === 'closed') ||
                  (auth.isStaff && (ticket.status === 'closed' || ticket.status === 'invalid'))
                "
                type="button"
                size="sm"
                icon="lucide:rotate-ccw"
                @click="reopenTicket"
              >
                {{ newComment.trim() ? '评论并重新打开' : '重新打开' }}
              </BaseButton>
              <BaseButton
                type="submit"
                size="sm"
                :loading="submitting"
                :disabled="!newComment.trim()"
                >发送</BaseButton
              >
            </div>
          </form>
        </div>
      </div>

      <!-- Sidebar -->
      <aside class="space-y-4 lg:w-[280px] lg:shrink-0">
        <!-- Status -->
        <div
          class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-3"
        >
          <h3
            class="text-xs font-semibold tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400"
          >
            状态
          </h3>
          <div class="flex items-center gap-2">
            <Icon
              :icon="statusOptions.find((s) => s.key === ticket!.status)?.icon || 'lucide:ban'"
              class="w-4 h-4"
              :class="STATUS_META[ticket.status].color"
            />
            <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
              {{ statusOptions.find((s) => s.key === ticket!.status)?.label }}
            </span>
          </div>

          <div
            v-if="visibleStatusOptions.length > 0"
            class="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800"
          >
            <BaseButton
              v-for="opt in visibleStatusOptions"
              :key="opt.key"
              size="sm"
              @click="changeStatus(opt.key)"
            >
              {{ opt.label }}
            </BaseButton>
          </div>
        </div>

        <!-- Info -->
        <div
          class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-3 text-sm"
        >
          <div class="flex justify-between">
            <span class="text-slate-500 dark:text-slate-400">类型</span>
            <span class="text-slate-700 dark:text-slate-300">{{
              templateName(ticket.template)
            }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500 dark:text-slate-400">来源</span>
            <span class="text-slate-700 dark:text-slate-300">{{ ticketSourceLabel }}</span>
          </div>
          <div v-if="ticket.server" class="flex justify-between">
            <span class="text-slate-500 dark:text-slate-400">服务器</span>
            <span class="text-slate-700 dark:text-slate-300">{{ ticket.server.name }}</span>
          </div>
        </div>

        <!-- Assignees -->
        <div
          class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-3"
        >
          <h3
            class="text-xs font-semibold tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400"
          >
            受理人
          </h3>

          <div v-if="ticket.assignees?.length" class="flex flex-wrap gap-2">
            <div v-for="a in ticket.assignees" :key="a.userId" class="flex items-center gap-2">
              <div class="w-6 h-6 shrink-0">
                <UserAvatar :username="a.user.username" :avatar-url="a.user.avatarUrl" />
              </div>
              <span class="text-sm text-slate-700 dark:text-slate-300">{{ a.user.username }}</span>
            </div>
          </div>
          <div v-else class="text-sm text-slate-400 dark:text-slate-500">未分配</div>

          <BaseButton
            v-if="auth.isStaff"
            :class="inlineActionButtonClass"
            @click="openAssignPicker"
          >
            <Icon icon="lucide:user-plus" class="w-3.5 h-3.5" />
            {{ ticket.assignees?.length ? '管理受理人' : '分配受理人' }}
          </BaseButton>
        </div>

        <!-- Assign picker modal -->
        <BaseModal v-model="showAssignPicker" title="分配受理人">
          <div class="space-y-3">
            <div class="relative">
              <Icon
                icon="lucide:search"
                class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
              />
              <BaseInput v-model="assignSearch" placeholder="搜索用户..." class="[&_input]:pl-9" />
            </div>

            <div class="max-h-64 overflow-y-auto space-y-0.5 -mx-1">
              <label
                v-for="u in filteredAssignableUsers"
                :key="u.id"
                class="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition"
              >
                <BaseCheckbox
                  :checked="selectedAssigneeIds.includes(u.id)"
                  @update:checked="toggleAssignee(u.id)"
                />
                <div class="w-7 h-7 shrink-0">
                  <UserAvatar :username="u.username" :avatar-url="u.avatarUrl" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm text-slate-900 dark:text-white truncate">
                    {{ u.username }}
                  </div>
                  <div class="text-[11px] text-slate-400 dark:text-slate-500">
                    {{ ROLE_META[u.role as Role].label }}
                  </div>
                </div>
              </label>
              <div
                v-if="!filteredAssignableUsers.length"
                class="py-4 text-center text-sm text-slate-400"
              >
                无匹配用户
              </div>
            </div>
          </div>

          <template #footer>
            <span class="text-xs text-slate-400 dark:text-slate-500 mr-auto self-center"
              >已选 {{ selectedAssigneeIds.length }} 人</span
            >
            <BaseButton size="sm" @click="showAssignPicker = false">取消</BaseButton>
            <BaseButton size="sm" :loading="assigning" @click="saveAssignees">确认</BaseButton>
          </template>
        </BaseModal>

        <!-- 附加信息 (Game Context) -->
        <div
          v-if="gameContext"
          class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-3 text-sm"
        >
          <h3
            class="text-xs font-semibold tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400"
          >
            附加信息
          </h3>
          <div v-if="gameContext.world" class="flex justify-between">
            <span class="text-slate-500 dark:text-slate-400">世界</span>
            <span class="text-slate-700 dark:text-slate-300">{{ gameContext.world }}</span>
          </div>
          <div
            v-if="
              gameContext.x !== undefined &&
              gameContext.y !== undefined &&
              gameContext.z !== undefined
            "
            class="flex justify-between"
          >
            <span class="text-slate-500 dark:text-slate-400">坐标</span>
            <span class="text-slate-700 dark:text-slate-300"
              >{{ gameContext.x }}, {{ gameContext.y }}, {{ gameContext.z }}</span
            >
          </div>
          <div v-if="gameContext.gameMode" class="flex justify-between">
            <span class="text-slate-500 dark:text-slate-400">游戏模式</span>
            <span class="text-slate-700 dark:text-slate-300">{{
              gameModeLabels[gameContext.gameMode.toLowerCase()] || gameContext.gameMode
            }}</span>
          </div>
        </div>

        <!-- Labels -->
        <TicketLabels :ticket="ticket" />
      </aside>
    </div>
  </div>
</template>

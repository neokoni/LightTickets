<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getSiteConfig, updateSettings } from '@/api/setup';
import { setRequireLoginCache, siteConfig } from '@/stores/site';
import { useUiStore } from '@/stores/ui';
import { handleError } from '@/utils/error';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseTextarea from '@/components/base/BaseTextarea.vue';
import BaseToggle from '@/components/base/BaseToggle.vue';

const ui = useUiStore();
const requireLogin = ref(false);
const allowWebRegister = ref(true);
const allowMcRegister = ref(true);
const siteName = ref('');
const siteUrl = ref('');
const footerContent = ref('');
const loading = ref(false);
const saving = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    const config = await getSiteConfig();
    requireLogin.value = config.requireLogin;
    siteName.value = config.siteName;
    siteUrl.value = config.siteUrl ?? '';
    allowWebRegister.value = config.allowWebRegister ?? true;
    allowMcRegister.value = config.allowMcRegister ?? true;
    footerContent.value = config.footerContent ?? '';
  } finally {
    loading.value = false;
  }
});

async function save() {
  saving.value = true;
  try {
    const result = await updateSettings({
      requireLogin: requireLogin.value,
      allowWebRegister: allowWebRegister.value,
      allowMcRegister: allowMcRegister.value,
      siteName: siteName.value,
      siteUrl: siteUrl.value || null,
      footerContent: footerContent.value || null,
    });
    setRequireLoginCache(result.requireLogin);
    siteConfig.siteName = result.siteName;
    siteConfig.siteUrl = result.siteUrl;
    siteConfig.footerContent = result.footerContent;
    siteConfig.allowWebRegister = result.allowWebRegister;
    siteConfig.allowMcRegister = result.allowMcRegister;
    ui.toast('设置已保存', 'success');
  } catch (e) {
    handleError(e, '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">平台设置</h2>

    <div v-if="loading" class="py-4 text-center text-slate-400">加载中...</div>

    <div v-else class="space-y-4 max-w-lg">
      <!-- Site Name -->
      <BaseInput v-model="siteName" label="站点名称" maxlength="100" placeholder="LightTickets" />

      <!-- Site URL -->
      <BaseInput
        v-model="siteUrl"
        label="站点地址"
        type="url"
        placeholder="https://ticket.example.com"
      />

      <!-- Footer Content -->
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-slate-900 dark:text-white">页脚自定义内容</label>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          支持 Markdown，可用于添加备案信息、版权声明等
        </p>
        <BaseTextarea
          v-model="footerContent"
          :rows="3"
          maxlength="2000"
          placeholder="[京ICP备xxxxxxx号](https://beian.miit.gov.cn)"
        />
      </div>

      <!-- Allow Web Register Toggle -->
      <div
        class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
      >
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">允许网页注册</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            关闭后登录页不显示注册入口，且网页注册接口将被禁用
          </p>
        </div>
        <BaseToggle v-model="allowWebRegister" />
      </div>

      <!-- Allow MC Register Toggle -->
      <div
        class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
      >
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">允许Minecraft注册</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            关闭后，服务器插件将无法通过API注册新账户
          </p>
        </div>
        <BaseToggle v-model="allowMcRegister" />
      </div>

      <!-- Require Login Toggle -->
      <div
        class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
      >
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">要求登录查看议题</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            开启后，未登录用户将无法查看议题列表和详情
          </p>
        </div>
        <BaseToggle v-model="requireLogin" />
      </div>

      <BaseButton filled :loading="saving" @click="save">{{
        saving ? '保存中...' : '保存'
      }}</BaseButton>
    </div>
  </div>
</template>

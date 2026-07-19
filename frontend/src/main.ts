import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useUiStore } from './stores/ui';
import { frontendConfig } from './config';
import { initI18n } from './i18n';
import './app.css';

async function bootstrap() {
  const pinia = createPinia();
  const ui = useUiStore(pinia);
  ui.initTheme();

  try {
    const res = await fetch(frontendConfig.serverUrl + '/health');
    if (!res.ok) throw new Error();
  } catch {
    const { default: ConnectionErrorView } = await import('./views/ConnectionErrorView.vue');
    const app = createApp(ConnectionErrorView);
    app.use(pinia);
    app.mount('#app');
    return;
  }

  const app = createApp(App);
  app.use(pinia);
  await initI18n();
  app.use(router);

  app.mount('#app');
}

bootstrap();

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useUiStore } from './stores/ui';
import { frontendConfig } from './config';
import './app.css';

async function bootstrap() {
  try {
    const res = await fetch(frontendConfig.backendUrl + '/health');
    if (!res.ok) throw new Error();
  } catch {
    const { default: ConnectionErrorView } = await import('./views/ConnectionErrorView.vue');
    const app = createApp(ConnectionErrorView);
    const pinia = createPinia();
    app.use(pinia);
    const ui = useUiStore();
    ui.initTheme();
    app.mount('#app');
    return;
  }

  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);

  const ui = useUiStore();
  ui.initTheme();

  app.mount('#app');
}

bootstrap();

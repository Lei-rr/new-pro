import { createPinia } from 'pinia';
import { createApp, type App as VueApp } from 'vue';
import type { Component } from 'vue';
import App from './App.vue';
import router from './router';
import './style.css';
import * as Badge from './components/ui/badge';
import * as Button from './components/ui/button';
import * as Card from './components/ui/card';
import * as Drawer from './components/ui/drawer';
import * as Input from './components/ui/input';
import * as Label from './components/ui/label';
import * as Pagination from './components/ui/pagination';
import * as Progress from './components/ui/progress';
import * as Select from './components/ui/select';
import * as Separator from './components/ui/separator';
import * as Sheet from './components/ui/sheet';
import * as Skeleton from './components/ui/skeleton';
import * as Switch from './components/ui/switch';
import * as Table from './components/ui/table';
import * as Tabs from './components/ui/tabs';

/**
 * shadcn 组件全局注册：按命名空间映射（Card → CardRoot/CardHeader/...）
 * 模板中直接使用 <Card>、<Button>、<Table> 等。
 */
const UI_LIBRARIES: Array<[string, Record<string, Component>]> = [
  ['Card', Card as unknown as Record<string, Component>],
  ['Button', Button as unknown as Record<string, Component>],
  ['Badge', Badge as unknown as Record<string, Component>],
  ['Table', Table as unknown as Record<string, Component>],
  ['Tabs', Tabs as unknown as Record<string, Component>],
  ['Select', Select as unknown as Record<string, Component>],
  ['Sheet', Sheet as unknown as Record<string, Component>],
  ['Drawer', Drawer as unknown as Record<string, Component>],
  ['Skeleton', Skeleton as unknown as Record<string, Component>],
  ['Switch', Switch as unknown as Record<string, Component>],
  ['Separator', Separator as unknown as Record<string, Component>],
  ['Input', Input as unknown as Record<string, Component>],
  ['Label', Label as unknown as Record<string, Component>],
  ['Progress', Progress as unknown as Record<string, Component>],
  ['Pagination', Pagination as unknown as Record<string, Component>],
];

function registerUiComponents(app: VueApp): void {
  for (const [prefix, components] of UI_LIBRARIES) {
    for (const [name, component] of Object.entries(components)) {
      const kebab = name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();
      const registeredName = `${prefix}${name.replace(prefix, '')}`;
      // 注册：CardHeader、CardTitle… 以及命名空间后缀（如 SheetContent）
      app.component(registeredName, component);
      // 也注册 kebab-case 形式，兼容不同写法
      app.component(kebab, component);
    }
  }
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
registerUiComponents(app);
app.mount('#app');

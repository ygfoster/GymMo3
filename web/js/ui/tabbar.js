// タブバー（ホーム / トレーニング / 記録（ダンベル）/ コンディション）。設定はホーム右上の歯車から。
// 選択中のタブをもう一度押すと先頭へスクロール or 戻る。
import { html, createEl } from '../lib/html.js';
import { icons } from './icons.js';
import { router } from '../router.js';
import { haptic } from '../lib/haptics.js';

const TABS = [
  { id: 'home', label: 'ホーム', icon: icons.tabToday, path: '/home' },
  { id: 'training', label: 'トレーニング', icon: icons.tabTraining, path: '/training' },
  { id: 'add' },
  { id: 'condition', label: 'コンディション', icon: icons.tabCondition, path: '/condition' },
];

export function createTabbar({ onAdd }) {
  const el = createEl(html`<nav class="tabbar" aria-label="メインメニュー">${TABS.map((t) =>
    t.id === 'add'
      ? html`<div class="tab-add"><button class="tab-add-btn" data-tab="add" aria-label="ワークアウトを記録">${icons.dumbbell}</button></div>`
      : html`<button class="tab" data-tab="${t.id}" aria-selected="false">${t.icon}<span>${t.label}</span></button>`
  )}</nav>`);

  const set = (current) => {
    el.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === current)));
  };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    haptic.select();
    if (b.dataset.tab === 'add') return onAdd();
    const info = router.info;
    if (info.tab === b.dataset.tab) router.reselectTab();
    else router.navigate(TABS.find((t) => t.id === b.dataset.tab).path);
  });

  router.onChange((info) => set(info.tab));
  return el;
}

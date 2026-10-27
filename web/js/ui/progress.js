// 画面上端の休憩の進捗ライン。どの画面にいても、残り時間の割合が一目で分かる。
// 実行中: オレンジが右から減る / 一時停止: 灰色 / 終了: 全幅が脈動 / 待機: 非表示
import { html, createEl } from '../lib/html.js';
import { timer } from '../timer.js';

export function createRestLine() {
  const el = createEl(html`<div class="rest-line" aria-hidden="true"><i></i></div>`);
  const bar = el.querySelector('i');
  const unsub = timer.subscribe((snap) => {
    el.dataset.state = snap.status;
    const frac = snap.status === 'done' ? 1 : snap.status === 'idle' ? 0 : snap.progress;
    bar.style.transform = `scaleX(${frac.toFixed(4)})`;
  });
  return { el, destroy: unsub };
}

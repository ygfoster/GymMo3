// タイマー ドック: 記録画面の下端に固定する 1 本のバー（full）と、他の画面のミニプレイヤー（compact）。
// GymMo3 での変更点:
// - 時間をタップすると、その場に ±10/±30 秒とテンプレートの行が出る（タイマー画面を開かない）
// - 残り 10 秒で時間表示が拡大・脈動し、3・2・1 で軽く振動する
// - 終了すると「次のセット」ボタンに変わり、押すまで消えない
import { html, createEl } from '../lib/html.js';
import { icons } from './icons.js';
import { timer } from '../timer.js';
import { fmtClock } from '../lib/format.js';
import { openSheet, confirmDialog } from './overlay.js';
import { state as appState, on as onStore } from '../store.js';
import { haptic } from '../lib/haptics.js';

const R = 28; // play ボタンの外周リング半径
const CIRC = 2 * Math.PI * R;

// 部位名は出さない（「休憩中 · 合計 05:12」のように簡潔に）
const caption = (snap) => {
  const total = snap.started ? ` · 合計 ${fmtClock(snap.workoutSec)}` : '';
  switch (snap.status) {
    case 'running': return `休憩中${total}`;
    case 'paused': return `一時停止${total}`;
    case 'done': return `休憩終了${total}`;
    default: return snap.started ? `休憩${total}` : '休憩タイマー';
  }
};

const ADJUST = [-30, -10, 10, 30];

export function createDock({ variant = 'full', onOpen } = {}) {
  const el = createEl(html`
    <div class="dock ${variant}" data-state="idle">
      <div class="dock-main">
        <button class="dock-info" data-act="info" aria-label="${variant === 'full' ? '休憩時間を調整' : '記録画面に戻る'}" aria-expanded="false">
          <span class="dock-time num">03:00</span>
          <span class="dock-cap">休憩タイマー</span>
        </button>
        <button class="dock-reset" data-act="reset" aria-label="リセット">${icons.resetArrow}</button>
        <button class="dock-play" data-act="toggle" aria-label="開始">
          <svg class="dock-ring" viewBox="0 0 64 64" aria-hidden="true">
            <circle class="trk" cx="32" cy="32" r="${R}"/>
            <circle class="prg" cx="32" cy="32" r="${R}" stroke-dasharray="${CIRC.toFixed(2)}" stroke-dashoffset="0" transform="rotate(-90 32 32)"/>
          </svg>
          <span class="dock-icon"></span>
        </button>
        <button class="dock-next" data-act="ack" hidden>次のセット${icons.next}</button>
      </div>
      ${variant === 'full' ? html`<div class="dock-adjust" hidden></div>` : ''}
    </div>`);
  const timeEl = el.querySelector('.dock-time');
  const capEl = el.querySelector('.dock-cap');
  const prg = el.querySelector('.prg');
  const iconEl = el.querySelector('.dock-icon');
  const playBtn = el.querySelector('.dock-play');
  const resetBtn = el.querySelector('.dock-reset');
  const nextBtn = el.querySelector('.dock-next');
  const infoBtn = el.querySelector('.dock-info');
  const adjustEl = el.querySelector('.dock-adjust');
  let lastStatus = '';
  let lastIconKey = '';
  let lastSec = -1;

  /* ---------- 調整行（full のみ） ---------- */
  const paintAdjust = (snap) => {
    if (!adjustEl || adjustEl.hidden) return;
    const templates = appState.settings.timer.templates;
    const cur = Math.round(snap.total);
    adjustEl.innerHTML = String(html`
      <div class="dock-adj-row">
        ${ADJUST.map((d) => html`<button class="adj" data-adj="${d}" aria-label="${d > 0 ? `${d}秒延長` : `${-d}秒短縮`}">${d > 0 ? '+' : '−'}${Math.abs(d)}</button>`)}
        <span class="adj-sep"></span>
        ${templates.map((t) => html`<button class="adj tpl" data-sec="${t}" aria-pressed="${t === cur}">${fmtClock(t)}</button>`)}
        <button class="adj more" data-act="sheet" aria-label="タイマーの詳細">${icons.ellipsis}</button>
      </div>`);
  };
  const setAdjustOpen = (open) => {
    if (!adjustEl) return;
    adjustEl.hidden = !open;
    infoBtn.setAttribute('aria-expanded', String(open));
    el.classList.toggle('adjusting', open);
    if (open) paintAdjust(timer.snapshot());
  };

  const paint = (snap) => {
    const secLeft = Math.ceil(snap.remaining);
    timeEl.textContent = fmtClock(secLeft);
    capEl.textContent = caption(snap);
    prg.style.strokeDashoffset = `${(CIRC * (1 - snap.progress)).toFixed(2)}`;
    el.dataset.state = snap.status;
    el.classList.toggle('nudge', snap.nudge && snap.status === 'idle');
    // 残り 10 秒: 時間を大きくして脈動、3・2・1 で軽く振動
    const ending = snap.status === 'running' && secLeft <= 10;
    el.classList.toggle('ending', ending);
    if (ending && secLeft <= 3 && secLeft !== lastSec && document.visibilityState === 'visible') haptic.select();
    lastSec = secLeft;

    const done = snap.status === 'done';
    nextBtn.hidden = !done;
    playBtn.hidden = done;
    resetBtn.hidden = done;
    const key = snap.status === 'running' ? 'pause' : 'play';
    if (key !== lastIconKey) {
      iconEl.innerHTML = '';
      iconEl.append(createEl(html`<span class="ico">${key === 'pause' ? icons.pause : icons.play}</span>`));
      playBtn.setAttribute('aria-label', key === 'pause' ? '一時停止' : '休憩を開始');
      lastIconKey = key;
    }
    if (snap.status !== lastStatus) {
      if (snap.status === 'done') {
        el.classList.remove('bounce');
        void el.offsetWidth;
        el.classList.add('bounce');
        setAdjustOpen(false);
      }
      lastStatus = snap.status;
    }
    if (adjustEl && !adjustEl.hidden) {
      adjustEl.querySelectorAll('[data-sec]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.sec) === Math.round(snap.total))));
    }
  };

  const unsub = timer.subscribe(paint);
  const unsubSettings = adjustEl ? onStore('settings', () => paintAdjust(timer.snapshot())) : () => {};

  el.addEventListener('click', (e) => {
    const adj = e.target.closest('[data-adj]');
    if (adj) {
      timer.adjust(Number(adj.dataset.adj));
      return;
    }
    const sec = e.target.closest('[data-sec]');
    if (sec) {
      haptic.select();
      timer.setDuration(Number(sec.dataset.sec));
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'toggle') timer.toggle();
    else if (act === 'reset') timer.reset();
    else if (act === 'ack') timer.ack();
    else if (act === 'sheet') openTimerSheet();
    else if (act === 'info') {
      if (variant === 'full') {
        haptic.select();
        setAdjustOpen(adjustEl.hidden);
      } else onOpen?.();
    }
  });

  return {
    el,
    closeAdjust: () => setAdjustOpen(false),
    destroy() {
      unsub();
      unsubSettings();
    },
  };
}

/* ==========================================================================
   タイマー詳細シート（円をなぞって調整・テンプレート・終了）
   ========================================================================== */
const RING = 112;
const RC = 2 * Math.PI * RING;

/** 円の上の点（12 時を 0、時計回り）の角度 → 0〜1 */
const angleFrac = (dx, dy) => {
  const a = Math.atan2(dx, -dy) / (2 * Math.PI);
  return a < 0 ? a + 1 : a;
};
const DRAG_STEP = 5; // 円をなぞるときの刻み（秒）

export function openTimerSheet() {
  const presets = appState.settings.timer.templates;
  const content = createEl(html`
    <div class="timer-sheet">
      <div class="timer-hero">
        <svg viewBox="0 0 252 252" class="timer-ring" aria-hidden="true">
          <circle class="trk" cx="126" cy="126" r="${RING}"/>
          <circle class="prg" cx="126" cy="126" r="${RING}" stroke-dasharray="${RC.toFixed(2)}" stroke-dashoffset="0" transform="rotate(-90 126 126)"/>
          <circle class="knob" cx="126" cy="${126 - RING}" r="11"/>
        </svg>
        <div class="timer-center">
          <div class="timer-big num">03:00</div>
          <div class="timer-sub t-footnote muted">休憩タイマー</div>
        </div>
      </div>
      <div class="timer-adjust">
        <button class="btn btn-tinted btn-sm" data-adj="-10">−10秒</button>
        <button class="btn btn-tinted btn-sm" data-adj="10">＋10秒</button>
      </div>
      <div class="timer-presets">${presets.map((p) => html`<button class="chip" data-sec="${p}" aria-pressed="false">${fmtClock(p)}</button>`)}</div>
      <div class="timer-actions">
        <button class="btn btn-tinted" data-act="reset">${icons.resetArrow}リセット</button>
        <button class="btn btn-primary" data-act="toggle">開始</button>
      </div>
      <div class="timer-total">
        <div><div class="t-footnote muted">ワークアウト合計時間</div><div class="t-title2 num" data-role="total">00:00</div></div>
        <button class="btn btn-danger btn-sm" data-act="end">終了</button>
      </div>
      <div class="t-footnote muted timer-hint">円をなぞると残り時間を変えられます。上端を越えて回し続けると延長できます。時間のボタンは「設定 › タイマーのテンプレート」で変更できます。</div>
    </div>`);
  const big = content.querySelector('.timer-big');
  const sub = content.querySelector('.timer-sub');
  const prg = content.querySelector('.prg');
  const toggleBtn = content.querySelector('[data-act="toggle"]');
  const totalEl = content.querySelector('[data-role="total"]');
  const chips = [...content.querySelectorAll('[data-sec]')];

  const hero = content.querySelector('.timer-hero');
  const knob = content.querySelector('.knob');
  const setRing = (frac) => {
    prg.style.strokeDashoffset = `${(RC * (1 - frac)).toFixed(2)}`;
    const a = frac * 2 * Math.PI;
    knob.setAttribute('cx', (126 + RING * Math.sin(a)).toFixed(2));
    knob.setAttribute('cy', (126 - RING * Math.cos(a)).toFixed(2));
  };
  let drag = null;

  const paint = (snap) => {
    if (!drag) {
      big.textContent = fmtClock(Math.ceil(snap.remaining));
      setRing(snap.progress);
    }
    sub.textContent = drag ? (drag.value > drag.lap ? `延長 ＋${fmtClock(drag.value - drag.lap)}` : '指を離すと反映') : caption(snap);
    content.dataset.state = snap.status;
    toggleBtn.textContent = snap.status === 'running' ? '一時停止' : snap.status === 'paused' ? '再開' : snap.status === 'done' ? '次のセット' : '開始';
    totalEl.textContent = fmtClock(snap.workoutSec);
    chips.forEach((c) => c.setAttribute('aria-pressed', String(Math.round(Number(c.dataset.sec)) === Math.round(snap.total))));
  };
  const unsub = timer.subscribe(paint);

  const previewDrag = () => {
    const { value, lap } = drag;
    const rem = value % lap;
    const frac = value > 0 && rem === 0 ? 1 : rem / lap;
    big.textContent = fmtClock(value);
    setRing(frac);
    sub.textContent = value > lap ? `延長 ＋${fmtClock(value - lap)}` : '指を離すと反映';
  };
  const pointAt = (e) => {
    const r = hero.getBoundingClientRect();
    const k = r.width / 252;
    const dx = (e.clientX - (r.left + r.width / 2)) / k;
    const dy = (e.clientY - (r.top + r.height / 2)) / k;
    return { dx, dy, dist: Math.hypot(dx, dy) };
  };
  hero.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = pointAt(e);
    if (p.dist < RING * 0.6 || p.dist > RING * 1.25) return;
    e.preventDefault();
    const snap = timer.snapshot();
    const lap = Math.max(DRAG_STEP, Math.round(snap.total));
    const f = angleFrac(p.dx, p.dy);
    const cur = snap.remaining / lap;
    const turns = f < 0.08 && cur > 0.75 ? f + 1 : f;
    drag = { id: e.pointerId, lap, turns, lastFrac: f, value: 0, lastHaptic: 0 };
    hero.setPointerCapture?.(e.pointerId);
    hero.classList.add('dragging');
    update(f);
  });
  const update = (f) => {
    let d = f - drag.lastFrac;
    if (d > 0.5) d -= 1;
    else if (d < -0.5) d += 1;
    drag.lastFrac = f;
    drag.turns = Math.min(3600 / drag.lap, Math.max(0, drag.turns + (drag.started ? d : 0)));
    drag.started = true;
    const value = Math.min(3600, Math.max(DRAG_STEP, Math.round((drag.turns * drag.lap) / DRAG_STEP) * DRAG_STEP));
    if (value !== drag.value) {
      const t = performance.now();
      if (drag.value && t - drag.lastHaptic > 35) {
        haptic.select();
        drag.lastHaptic = t;
      }
      drag.value = value;
    }
    previewDrag();
  };
  hero.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = pointAt(e);
    if (p.dist < 8) return;
    update(angleFrac(p.dx, p.dy));
  });
  const endDrag = (e, commit) => {
    if (!drag || e.pointerId !== drag.id) return;
    const value = drag.value;
    drag = null;
    hero.classList.remove('dragging');
    if (commit) timer.setRemaining(value);
    else paint(timer.snapshot());
  };
  hero.addEventListener('pointerup', (e) => endDrag(e, true));
  hero.addEventListener('pointercancel', (e) => endDrag(e, false));

  const sheet = openSheet({ title: '休憩タイマー', content, right: html`<button class="nav-btn strong" data-close>完了</button>`, onClose: unsub, dragBody: false });
  content.addEventListener('click', async (e) => {
    const adj = e.target.closest('[data-adj]');
    const sec = e.target.closest('[data-sec]');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (adj) timer.adjust(Number(adj.dataset.adj));
    else if (sec) timer.setDuration(Number(sec.dataset.sec));
    else if (act === 'toggle') (timer.snapshot().status === 'done' ? timer.ack() : timer.toggle());
    else if (act === 'reset') timer.reset();
    else if (act === 'end') {
      const ok = await confirmDialog({ title: 'ワークアウトを終了しますか？', message: '休憩タイマーと合計時間をリセットします。記録した内容は消えません。', confirmLabel: '終了する', destructive: true });
      if (ok) {
        timer.endWorkout();
        sheet.close();
      }
    }
  });
  return sheet;
}

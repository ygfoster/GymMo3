// コンディション: Fitbit（Google ヘルス）のデータを 1 か所に。週（7 列の棒）／月（ヒートマップ）と、トレーニングとの関係。
import { html, createEl } from '../lib/html.js';
import { icons } from '../ui/icons.js';
import { createScreen, lazyUpdater } from './common.js';
import { state, on, getIndex, refreshHealth, sync } from '../store.js';
import { router } from '../router.js';
import { toast } from '../ui/overlay.js';
import { healthView, healthSeries, mean, trainVsRest, sleepVsPerformance, daysInRange, periodRange } from '../lib/metrics.js';
import { todayKey, addDays, startOfWeek, startOfMonth, addMonths, monthMatrix, fromKey, formatMD, formatMonthTitle, WEEKDAYS, pad2 } from '../lib/dates.js';
import { fmtInt, fmtSigned, fmtPct } from '../lib/format.js';
import { formatSleep } from '../lib/parse.js';
import { haptic } from '../lib/haptics.js';
import { settleRise } from '../lib/dom.js';

const MODES = [
  { id: 'week', label: '週' },
  { id: 'month', label: '月' },
];
const METRICS = [
  { id: 'sleep', label: '睡眠', color: 'var(--c-sleep)' },
  { id: 'protein', label: 'タンパク質', color: 'var(--c-protein)' },
  { id: 'balance', label: 'カロリー収支', color: 'var(--c-move)' },
];
const WK = ['月', '火', '水', '木', '金', '土', '日'];
const hm = (min) => `${Math.floor(min / 60)}:${pad2(Math.round(min % 60))}`;
const endOfMonth = (monthKey) => addDays(addMonths(monthKey, 1), -1);

export function createConditionView() {
  let mode = 'week';
  let metric = 'sleep';
  let weekStart = startOfWeek(todayKey());
  let monthKey = startOfMonth(todayKey());
  let renderedOnce = false;

  const screen = createScreen({
    title: 'コンディション',
    eyebrow: 'Google ヘルス（Fitbit）',
    className: 'condition',
    onRefresh: () => Promise.all([sync(), state.mode ? refreshHealth(todayKey(), { force: true }) : null]),
    right: html`<button class="nav-btn icon" data-act="refresh" aria-label="今日のデータを取り直す">${icons.refresh}</button>`,
  });
  const top = createEl(html`<div class="seg-wrap"><div class="segmented" style="--n:2;--i:0" role="group" aria-label="期間">${MODES.map((m) => html`<button data-mode="${m.id}" aria-pressed="${m.id === mode}">${m.label}</button>`)}</div></div>`);
  const content = createEl(html`<div class="cond-content"></div>`);
  screen.body.append(top, content);

  /* ---------- 週 ---------- */
  const weekCard = ({ id, label, color, goal, keys, vals, fmt, signed = false, trained, today, summary }) => {
    const nums = vals.filter((v) => v != null);
    const maxAbs = Math.max(1, ...nums.map((v) => Math.abs(v)));
    const scale = signed ? maxAbs : Math.max(goal ? goal * 1.15 : 0, ...nums, 1);
    const goalPos = !signed && goal ? Math.min(1, goal / scale) : null;
    return html`
      <section class="card cond-week-card" data-metric="${id}">
        <div class="card-head"><div class="card-title" style="color:${color}">${label}</div><div class="card-aside">${summary}</div></div>
        <div class="wk-grid ${signed ? 'signed' : ''}">
          ${keys.map((k, i) => {
            const v = vals[i];
            const h = v == null ? 0 : signed ? Math.min(1, Math.abs(v) / maxAbs) : Math.min(1, v / scale);
            const ok = !signed && goal && v != null && v >= goal;
            return html`<button class="wk-col ${k === today ? 'now' : ''} ${k > today ? 'future' : ''}" data-day="${k}" aria-label="${formatMD(k)}">
              <span class="wk-v ${v == null ? 'faint' : ''}">${v == null ? '–' : fmt(v)}</span>
              <span class="wk-track">${goalPos != null ? html`<i class="wk-goal" style="--g:${goalPos.toFixed(3)}"></i>` : ''}${signed ? html`<i class="wk-zero"></i>` : ''}
                <i class="wk-bar ${ok ? 'ok' : ''} ${signed && v != null && v < 0 ? 'neg' : ''}" style="--h:${h.toFixed(3)};--c:${color}"></i></span>
              <span class="wk-d">${WK[i]}${trained.has(k) ? html`<i class="wk-t"></i>` : ''}</span>
            </button>`;
          })}
        </div>
      </section>`;
  };

  const renderWeek = () => {
    const today = todayKey();
    const g = state.settings.goals;
    const keys = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const hvs = keys.map((k) => healthView(state.health[k], k, today));
    const trained = new Set(daysInRange(state.training, keys[0], keys[6]));
    const sleep = hvs.map((h) => h.sleepMin);
    const protein = hvs.map((h) => h.protein);
    const balance = hvs.map((h) => h.balance);
    const avg = (a) => {
      const v = a.filter((x) => x != null);
      return v.length ? mean(v) : null;
    };
    const cnt = (a, goal) => a.filter((v) => v != null && v >= goal).length;
    const days = (a) => a.filter((v) => v != null).length;
    const sAvg = avg(sleep);
    const pAvg = avg(protein);
    const bVals = balance.filter((v) => v != null);
    const isThisWeek = weekStart === startOfWeek(today);
    return html`
      <div class="range-nav rise" style="--i:0">
        <button class="icon-btn" data-act="prev" aria-label="前の週">${icons.chevronLeft}</button>
        <button class="range-title" data-act="this">${formatMD(keys[0])} 〜 ${formatMD(keys[6])}${isThisWeek ? html` <span class="muted">・今週</span>` : ''}</button>
        <button class="icon-btn" data-act="next" aria-label="次の週" ${isThisWeek ? 'disabled' : ''}>${icons.chevronRight}</button>
      </div>
      <div class="rise" style="--i:1">${weekCard({ id: 'sleep', label: '睡眠', color: 'var(--c-sleep)', goal: g.sleepMin, keys, vals: sleep, fmt: hm, trained, today, summary: html`平均 <b>${sAvg != null ? formatSleep(Math.round(sAvg)) : '--'}</b> ・ 目標達成 <b>${cnt(sleep, g.sleepMin)}</b>/${days(sleep)}日` })}</div>
      <div class="rise" style="--i:2">${weekCard({ id: 'protein', label: 'タンパク質', color: 'var(--c-protein)', goal: g.protein, keys, vals: protein, fmt: (v) => `${fmtInt(v)}`, trained, today, summary: html`平均 <b>${pAvg != null ? `${fmtInt(pAvg)} g` : '--'}</b> ・ 目標達成 <b>${cnt(protein, g.protein)}</b>/${days(protein)}日` })}</div>
      <div class="rise" style="--i:3">${weekCard({ id: 'balance', label: 'カロリー収支', color: 'var(--c-move)', goal: null, keys, vals: balance, fmt: (v) => fmtSigned(v), signed: true, trained, today, summary: html`合計 <b>${bVals.length ? `${fmtSigned(bVals.reduce((a, b) => a + b, 0))} kcal` : '--'}</b> ・ 平均 <b>${bVals.length ? fmtSigned(mean(bVals)) : '--'}</b>` })}</div>
      ${pfcCard(hvs, 4)}`;
  };

  /* ---------- 月 ---------- */
  const renderMonth = () => {
    const today = todayKey();
    const g = state.settings.goals;
    const d = fromKey(monthKey);
    const cells = monthMatrix(d.getFullYear(), d.getMonth());
    const m = METRICS.find((x) => x.id === metric);
    const from = monthKey;
    const to = endOfMonth(monthKey) < today ? endOfMonth(monthKey) : today;
    const hvs = healthSeries(state.health, from, to, today);
    const trained = new Set(daysInRange(state.training, from, to));
    const valueOf = (h) => (metric === 'sleep' ? h.sleepMin : metric === 'protein' ? h.protein : h.balance);
    const goal = metric === 'sleep' ? g.sleepMin : metric === 'protein' ? g.protein : null;
    const vals = hvs.map(valueOf).filter((v) => v != null);
    const byKey = Object.fromEntries(hvs.map((h) => [h.date, valueOf(h)]));
    const level = (v) => {
      if (v == null) return '';
      if (metric === 'balance') return v < 0 ? `def d${Math.min(4, Math.ceil(Math.abs(v) / 400))}` : `sur d${Math.min(4, Math.ceil(v / 400))}`;
      const r = v / goal;
      return r >= 1 ? 'ok' : r >= 0.85 ? 'l3' : r >= 0.6 ? 'l2' : 'l1';
    };
    const fmt = metric === 'sleep' ? hm : metric === 'protein' ? (v) => `${fmtInt(v)}` : (v) => fmtSigned(v);
    const achieved = goal ? vals.filter((v) => v >= goal).length : null;
    const isThisMonth = monthKey === startOfMonth(today);
    return html`
      <div class="range-nav rise" style="--i:0">
        <button class="icon-btn" data-act="prev" aria-label="前の月">${icons.chevronLeft}</button>
        <button class="range-title" data-act="this">${formatMonthTitle(d.getFullYear(), d.getMonth())}</button>
        <button class="icon-btn" data-act="next" aria-label="次の月" ${isThisMonth ? 'disabled' : ''}>${icons.chevronRight}</button>
      </div>
      <div class="chip-row metric-chips rise" style="--i:1" role="group" aria-label="指標">${METRICS.map((x) => html`<button class="chip" data-metric="${x.id}" aria-pressed="${x.id === metric}"><i class="dot" style="background:${x.color}"></i>${x.label}</button>`)}</div>
      <section class="card heat-card rise" style="--i:2" style="--c:${m.color}">
        <div class="cal-week">${WK.map((w, i) => html`<span class="${i >= 5 ? 'we' : ''}">${w}</span>`)}</div>
        <div class="heat-grid" style="--c:${m.color}">${cells.map((c) => {
          const v = c.inMonth ? byKey[c.key] : null;
          return html`<button class="heat-cell ${c.inMonth ? '' : 'out'} ${c.key === today ? 'today' : ''} ${c.key > today ? 'future' : ''} ${c.inMonth ? level(v) : ''}" data-day="${c.key}" ${c.inMonth ? '' : 'tabindex="-1"'} aria-label="${c.key}${v != null ? ` ${fmt(v)}` : ''}">
            <span class="d">${c.day}</span><span class="v">${v != null ? fmt(v) : ''}</span>${trained.has(c.key) ? html`<i class="t"></i>` : ''}
          </button>`;
        })}</div>
        <div class="heat-legend">${metric === 'balance'
          ? html`<span><i class="sw def d3"></i>消費が多い</span><span><i class="sw sur d3"></i>摂取が多い</span><span><i class="sw tr"></i>トレ日</span>`
          : html`<span><i class="sw l1"></i>目標の60%未満</span><span><i class="sw l3"></i>85%〜</span><span><i class="sw ok"></i>達成</span><span><i class="sw tr"></i>トレ日</span>`}</div>
      </section>
      <div class="stat-trio rise" style="--i:3">
        <div class="stat"><div class="stat-v">${vals.length ? (metric === 'sleep' ? html`${Math.floor(mean(vals) / 60)}<small>h</small>${pad2(Math.round(mean(vals) % 60))}<small>m</small>` : metric === 'protein' ? html`${fmtInt(mean(vals))}<small>g</small>` : html`${fmtSigned(mean(vals))}`) : '--'}</div><div class="stat-k">平均</div></div>
        <div class="stat"><div class="stat-v">${achieved != null ? html`${achieved}<small>/${vals.length}日</small>` : html`${vals.length ? fmtSigned(vals.reduce((a, b) => a + b, 0)) : '--'}`}</div><div class="stat-k">${achieved != null ? '目標達成' : '月の合計'}</div></div>
        <div class="stat"><div class="stat-v">${trained.size}<small>日</small></div><div class="stat-k">トレーニング</div></div>
      </div>
      ${pfcCard(hvs, 4)}`;
  };

  /* ---------- 共通カード ---------- */
  const pfcCard = (hvs, i) => {
    const days = hvs.filter((h) => h.shares);
    if (!days.length) return '';
    const share = { p: mean(days.map((h) => h.shares.p)), f: mean(days.map((h) => h.shares.f)), c: mean(days.map((h) => h.shares.c)) };
    const grams = { p: mean(days.map((h) => h.protein)), f: mean(days.map((h) => h.fat)), c: mean(days.map((h) => h.carb)) };
    const kcal = mean(days.map((h) => h.intake));
    return html`<section class="card rise" style="--i:${i}">
      <div class="card-head"><div class="card-title">${icons.fork}<span>栄養バランス</span></div><div class="card-aside">${days.length}日の平均 ・ ${fmtInt(kcal)} kcal</div></div>
      <div class="pfc-bar">${[['p', 'var(--c-protein)'], ['f', 'var(--c-fat)'], ['c', 'var(--c-carb)']].map(([k, c]) => html`<i class="on" style="--w:${(share[k] * 100).toFixed(1)}%;background:${c}"></i>`)}</div>
      <div class="pfc-cols">${[['タンパク質', 'p', 'var(--c-protein)'], ['脂質', 'f', 'var(--c-fat)'], ['炭水化物', 'c', 'var(--c-carb)']].map(([l, k, c]) => html`<div class="pfc-col"><div class="pfc-k"><i style="background:${c}"></i>${l}</div><div class="pfc-v">${fmtInt(grams[k])}<small>g</small></div><div class="pfc-p">${fmtPct(share[k])}</div></div>`)}</div>
    </section>`;
  };

  const relationCards = () => {
    const today = todayKey();
    const from = addDays(today, -27);
    const tv = trainVsRest(state.training, state.health, from, today, today);
    const r = periodRange('3M', today, null);
    const svp = sleepVsPerformance(state.training, state.health, getIndex(), r.from, r.to);
    const cell = (v, f) => (v == null ? html`<span class="faint">--</span>` : f(v));
    return html`
      <section class="section rise" style="--i:5">
        <div class="section-head"><h2 class="section-title">トレ日と休息日</h2><span class="card-aside">直近28日 ・ トレ ${tv.train.days}日</span></div>
        <div class="card">
          <div class="tvr-head"><span></span><span>トレ日</span><span>休息日</span></div>
          <div class="tvr-row"><span class="tvr-k" style="color:var(--c-sleep)">睡眠</span><b>${cell(tv.train.sleep, (v) => formatSleep(Math.round(v)))}</b><b>${cell(tv.rest.sleep, (v) => formatSleep(Math.round(v)))}</b></div>
          <div class="tvr-row"><span class="tvr-k" style="color:var(--c-protein)">タンパク質</span><b>${cell(tv.train.protein, (v) => `${fmtInt(v)} g`)}</b><b>${cell(tv.rest.protein, (v) => `${fmtInt(v)} g`)}</b></div>
          <div class="tvr-row"><span class="tvr-k" style="color:var(--c-move)">摂取カロリー</span><b>${cell(tv.train.intake, (v) => `${fmtInt(v)}`)}</b><b>${cell(tv.rest.intake, (v) => `${fmtInt(v)}`)}</b></div>
          <p class="card-note">トレーニングした日の睡眠や食事が、休息日と比べてどう違うかの平均です。</p>
        </div>
      </section>
      <section class="section rise" style="--i:6">
        <div class="section-head"><h2 class="section-title">睡眠と重量の関係</h2><span class="card-aside">直近3か月</span></div>
        <div class="card">
          ${svp.samples >= 6
            ? html`<div class="svp">${svp.buckets.map((b) => {
                const enough = b.perf != null && b.n >= 3;
                const pct = enough ? (b.perf - 1) * 100 : null;
                const w = enough ? Math.min(100, Math.max(6, b.perf * 50)) : 0;
                return html`<div class="svp-row"><div class="svp-l">${b.label}<small>${b.n}回</small></div>
                  <div class="svp-bar"><i class="on ${pct != null && pct < 0 ? 'neg' : ''}" style="--w:${w}%"></i><b></b></div>
                  <div class="svp-v ${pct == null ? 'faint' : pct < 0 ? 'down' : 'up'}">${pct != null ? `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%` : '--'}</div></div>`;
              })}</div>
              <p class="card-note">各種目の推定1RMを、その種目の期間平均と比べた値です（${svp.samples}日分）。</p>`
            : html`<div class="empty tight"><div class="s">睡眠と重量の両方が記録された日が増えると表示されます（現在 ${svp.samples}日 / 6日）。</div></div>`}
        </div>
      </section>`;
  };

  const render = () => {
    if (!state.loaded && !Object.keys(state.health).length) {
      content.innerHTML = '<div class="skeleton" style="height:48px;border-radius:14px"></div><div class="skeleton" style="height:200px;border-radius:22px;margin-top:14px"></div><div class="skeleton" style="height:200px;border-radius:22px;margin-top:14px"></div>';
      return;
    }
    content.innerHTML = String(html`<div class="cond-stack">${mode === 'week' ? renderWeek() : renderMonth()}${relationCards()}</div>`);
    settleRise(content, !renderedOnce);
    renderedOnce = true;
    requestAnimationFrame(() => requestAnimationFrame(() => content.querySelectorAll('.wk-bar').forEach((i) => i.classList.add('on'))));
  };

  /* ---------- 操作 ---------- */
  top.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b || b.dataset.mode === mode) return;
    haptic.select();
    mode = b.dataset.mode;
    const seg = top.querySelector('.segmented');
    seg.style.setProperty('--i', MODES.findIndex((m) => m.id === mode));
    seg.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mode === mode)));
    render();
    screen.el.scrollTo({ top: 0 });
  });
  screen.el.addEventListener('click', async (e) => {
    const mc = e.target.closest('[data-metric]');
    if (mc && mc.classList.contains('chip')) {
      haptic.select();
      metric = mc.dataset.metric;
      render();
      return;
    }
    const day = e.target.closest('[data-day]');
    if (day && !day.classList.contains('out')) {
      haptic.tap();
      router.navigate(`/day/${day.dataset.day}`);
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const today = todayKey();
    if (act === 'prev' || act === 'next') {
      haptic.select();
      const dir = act === 'prev' ? -1 : 1;
      if (mode === 'week') weekStart = addDays(weekStart, 7 * dir);
      else monthKey = addMonths(monthKey, dir);
      render();
    } else if (act === 'this') {
      haptic.select();
      weekStart = startOfWeek(today);
      monthKey = startOfMonth(today);
      render();
    } else if (act === 'refresh') {
      if (!state.mode) return;
      haptic.tap();
      await Promise.all([sync(), refreshHealth(today, { force: true })]);
      toast('ヘルスデータを更新しました');
    }
  });

  const lazy = lazyUpdater(render);
  const offs = [on('data', lazy.request), on('settings', lazy.request)];
  render();
  return {
    el: screen.el,
    onShow() {
      lazy.show();
      if (state.mode) refreshHealth(todayKey());
    },
    onHide: lazy.hide,
    destroy: () => offs.forEach((f) => f()),
  };
}

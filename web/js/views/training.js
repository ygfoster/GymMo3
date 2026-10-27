// トレーニング: 履歴と種目を 1 か所に。上の検索欄 1 つで、種目名・部位・メモ・日付を横断して絞り込める。
import { html, createEl } from '../lib/html.js';
import { icons } from '../ui/icons.js';
import { createScreen, partTag, lazyUpdater } from './common.js';
import { state, on, getIndex, partColor, allParts, sync } from '../store.js';
import { router } from '../router.js';
import { createCalendar } from '../ui/calendar.js';
import { marksFor } from '../ui/datepicker.js';
import { sparkline } from '../ui/charts.js';
import { dayStats, trainingDates, sessionOn } from '../lib/metrics.js';
import { partCategory } from '../lib/parse.js';
import { todayKey, startOfMonth, startOfWeek, addDays, fromKey, formatShort, diffDays } from '../lib/dates.js';
import { fmtInt, fmtNum } from '../lib/format.js';
import { haptic } from '../lib/haptics.js';
import { settleRise } from '../lib/dom.js';

const MODES = [
  { id: 'history', label: '履歴' },
  { id: 'exercises', label: '種目' },
];

export function createTrainingView() {
  let mode = 'history';
  let query = '';
  let showCal = false;
  let renderedOnce = false;
  let cal = null;

  const screen = createScreen({
    title: 'トレーニング',
    eyebrow: '履歴と種目',
    className: 'training',
    onRefresh: () => sync(),
    right: html`<button class="nav-btn icon" data-act="cal" aria-label="カレンダー表示" aria-pressed="false">${icons.calendar}</button>`,
  });
  const top = createEl(html`<div class="train-top">
    <div class="search"><span class="search-i">${icons.search}</span><input class="field" type="search" placeholder="種目・部位・メモ・日付を検索" aria-label="検索" autocomplete="off" enterkeyhint="search" /></div>
    <div class="seg-wrap"><div class="segmented" style="--n:2;--i:0" role="group" aria-label="表示">${MODES.map((m) => html`<button data-mode="${m.id}" aria-pressed="${m.id === mode}">${m.label}</button>`)}</div></div>
  </div>`);
  const content = createEl(html`<div class="train-content"></div>`);
  screen.body.append(top, content);
  const input = top.querySelector('input');

  const matches = (q, ...texts) => texts.some((t) => String(t || '').toLowerCase().includes(q));

  /* ---------- 履歴 ---------- */
  const renderHistory = () => {
    const q = query.trim().toLowerCase();
    const today = todayKey();
    let dates = trainingDates(state.training).reverse();
    if (q) {
      dates = dates.filter((d) => {
        const day = state.training[d];
        return matches(q, d, formatShort(d)) || day.exercises.some((e) => matches(q, e.name, e.memo, partCategory(e.part || day.part)));
      });
    }
    const groups = new Map();
    for (const d of dates) {
      const ym = d.slice(0, 7);
      if (!groups.has(ym)) groups.set(ym, []);
      groups.get(ym).push(d);
    }
    const all = trainingDates(state.training);
    const weekStart = startOfWeek(today);
    const month = startOfMonth(today);
    const wk = all.filter((d) => d >= weekStart && d <= addDays(weekStart, 6)).length;
    const mo = all.filter((d) => d.slice(0, 7) === month.slice(0, 7)).length;
    const index = getIndex();

    content.innerHTML = String(html`
      ${q ? '' : html`<div class="stat-trio rise" style="--i:0">
        <div class="stat"><div class="stat-v">${wk}<small>日</small></div><div class="stat-k">今週</div></div>
        <div class="stat"><div class="stat-v">${mo}<small>日</small></div><div class="stat-k">今月</div></div>
        <div class="stat"><div class="stat-v">${all.length}<small>日</small></div><div class="stat-k">累計</div></div>
      </div>`}
      <div class="cal-slot" ${showCal && !q ? '' : 'hidden'}></div>
      ${groups.size
        ? [...groups.entries()].map(([ym, days], gi) => {
            const d = fromKey(`${ym}-01`);
            return html`<section class="section rise" style="--i:${Math.min(gi + 1, 6)}">
              <div class="section-head"><h2 class="section-title">${d.getFullYear()}年${d.getMonth() + 1}月</h2><span class="card-aside">${days.length}日</span></div>
              <div class="group">${days.map((k) => {
                const day = state.training[k];
                const st = dayStats(day);
                const prs = day.exercises.filter((ex) => {
                  const s = sessionOn(index, ex.name, k);
                  return s && (s.pr.rm || s.pr.weight || s.pr.reps);
                }).length;
                const names = day.exercises.map((e) => e.name);
                const shown = names.slice(0, 3).join('、') + (names.length > 3 ? ` ほか${names.length - 3}` : '');
                return html`<button class="row day-row" data-day="${k}">
                  <div class="row-body">
                    <div class="day-row-top"><span class="day-row-date">${formatShort(k)}${k === today ? html` <span class="today-mark">今日</span>` : ''}</span><span class="part-tags">${st.parts.map((p) => partTag(p))}</span></div>
                    <div class="row-sub day-row-names">${shown}</div>
                    <div class="row-sub">${st.sets}セット ・ ${fmtInt(st.volume)}kg${prs ? html` ・ <span class="gold-text">${icons.star}PR ${prs}</span>` : ''}</div>
                  </div>${icons.rowChevron}
                </button>`;
              })}</div>
            </section>`;
          })
        : html`<div class="card rise" style="--i:1"><div class="empty"><div class="t">${q ? '見つかりませんでした' : '記録がありません'}</div><div class="s">${q ? '別の言葉で探してみてください。' : '中央のボタンから最初のワークアウトを記録しましょう。'}</div></div></div>`}`);

    if (showCal && !q) {
      if (!cal) {
        cal = createCalendar({ month: startOfMonth(today), marks: marksFor, onSelect: (key) => router.navigate(`/day/${key}`) });
      } else cal.refresh();
      const slot = content.querySelector('.cal-slot');
      const card = createEl(html`<section class="card cal-card rise" style="--i:1"></section>`);
      card.append(cal.el);
      slot.append(card);
    }
  };

  /* ---------- 種目 ---------- */
  const renderExercises = () => {
    const q = query.trim().toLowerCase();
    const today = todayKey();
    const index = getIndex();
    const entries = [...index.values()].filter((e) => !q || matches(q, e.name, e.part));
    const groups = allParts()
      .map((p) => ({ p, list: entries.filter((e) => e.part === p).sort((a, b) => (a.sessions.at(-1).date < b.sessions.at(-1).date ? 1 : -1)) }))
      .filter((g) => g.list.length);
    content.innerHTML = String(html`
      ${groups.length
        ? groups.map((g, gi) => html`<section class="section rise" style="--i:${Math.min(gi, 6)}">
            <div class="section-head"><h2 class="section-title part-title"><i style="background:${partColor(g.p)}"></i>${g.p}</h2><span class="card-aside">${g.list.length}種目</span></div>
            <div class="group">${g.list.map((e) => {
              const last = e.sessions.at(-1);
              const weighted = e.sessions.some((s) => s.weighted);
              const vals = e.sessions.slice(-8).map((s) => (weighted ? s.best1RM : s.maxReps));
              const recentPR = e.sessions.some((s) => diffDays(today, s.date) <= 30 && (s.pr.rm || s.pr.weight || s.pr.reps));
              return html`<button class="row ex-row" data-ex="${e.name}">
                <div class="row-body"><div class="row-title">${e.name}${recentPR ? html` <span class="pr mini">${icons.star}PR</span>` : ''}</div>
                  <div class="row-sub">最終 ${formatShort(last.date)} ・ ${weighted ? `推定1RM ${fmtNum(last.best1RM)}kg` : `最多 ${last.maxReps}回`} ・ ${e.sessions.length}回</div></div>
                <div class="spark">${sparkline(vals, { color: partColor(e.part), width: 64, height: 26 })}</div>${icons.rowChevron}
              </button>`;
            })}</div>
          </section>`)
        : html`<div class="card rise" style="--i:0"><div class="empty"><div class="t">${q ? '見つかりませんでした' : '種目がありません'}</div><div class="s">${q ? '別の言葉で探してみてください。' : 'ワークアウトを記録すると、ここに種目が並びます。'}</div></div></div>`}`);
  };

  const render = () => {
    if (!state.loaded && !Object.keys(state.training).length) {
      content.innerHTML = '<div class="skeleton" style="height:84px;border-radius:22px"></div><div class="skeleton" style="height:260px;border-radius:22px;margin-top:14px"></div>';
      return;
    }
    if (mode === 'history') renderHistory();
    else renderExercises();
    settleRise(content, !renderedOnce);
    renderedOnce = true;
    screen.el.querySelector('[data-act="cal"]').hidden = mode !== 'history';
  };

  /* ---------- 操作 ---------- */
  let typing = 0;
  input.addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(() => {
      query = input.value;
      render();
    }, 120);
  });
  top.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b || b.dataset.mode === mode) return;
    haptic.select();
    mode = b.dataset.mode;
    const seg = top.querySelector('.segmented');
    seg.style.setProperty('--i', MODES.findIndex((m) => m.id === mode));
    seg.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mode === mode)));
    render();
  });
  screen.el.addEventListener('click', (e) => {
    const day = e.target.closest('[data-day]');
    if (day) {
      haptic.tap();
      router.navigate(`/day/${day.dataset.day}`);
      return;
    }
    const ex = e.target.closest('[data-ex]');
    if (ex) {
      haptic.tap();
      router.navigate(`/exercise/${encodeURIComponent(ex.dataset.ex)}`);
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'cal') {
      haptic.select();
      showCal = !showCal;
      e.target.closest('[data-act]').setAttribute('aria-pressed', String(showCal));
      render();
    }
  });

  const lazy = lazyUpdater(render);
  const offs = [on('data', lazy.request), on('settings', lazy.request)];
  render();
  return {
    el: screen.el,
    onShow: lazy.show,
    onHide: lazy.hide,
    destroy: () => offs.forEach((f) => f()),
  };
}

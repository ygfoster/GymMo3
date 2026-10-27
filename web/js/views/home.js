// ホーム: 今日の判断に必要なものだけ。
// 今日の調子（睡眠）→ 食事の進み → トレーニング（今日の記録 or「次はこれ」）→ 最近の自己ベスト → 今週
import { html, createEl } from '../lib/html.js';
import { icons } from '../ui/icons.js';
import { createScreen, partTag, setPill, lazyUpdater } from './common.js';
import { state, on, getIndex, partColor, allParts, refreshHealth, hasDraft, sync, healthFetchedAt } from '../store.js';
import { router } from '../router.js';
import { setPrefill } from '../intent.js';
import { todayKey, addDays, diffDays, formatMD, formatWeekdayLong, formatShort, startOfWeek, WEEKDAYS, fromKey } from '../lib/dates.js';
import { dayStats, healthView, sessionOn, mean, lastDateByPart, recentPRs, weekTotals, exerciseStats } from '../lib/metrics.js';
import { fmtInt, fmtSigned, fmtNum, fmtPct } from '../lib/format.js';
import { formatSleep, partCategory, OTHER_PART } from '../lib/parse.js';
import { haptic } from '../lib/haptics.js';
import { settleRise } from '../lib/dom.js';

const sleepParts = (min) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return html`<span class="bignum xl">${h}<small>時間</small>${m ? html`${m}<small>分</small>` : ''}</span>`;
};
const fmtDur = (min) => {
  const a = Math.abs(Math.round(min));
  const h = Math.floor(a / 60);
  const m = a % 60;
  return h ? `${h}時間${m ? `${m}分` : ''}` : `${m}分`;
};
const hhmm = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function createHomeView() {
  const today = todayKey();
  const screen = createScreen({
    title: '今日',
    eyebrow: `${formatMD(today)} ${formatWeekdayLong(today)}`,
    className: 'home',
    onRefresh: () => Promise.all([sync(), state.mode ? refreshHealth(todayKey(), { force: true }) : null]),
    right: html`<button class="nav-btn icon" data-act="settings" aria-label="設定">${icons.gear}</button>`,
  });
  const content = createEl(html`<div class="home-content"></div>`);
  screen.body.append(content);
  let selectedPart = null; // 「次はこれ」で選んでいる部位（null＝自動: 最後にやってから最も長い部位）
  let renderedOnce = false;

  /* ---------- 今日の調子（睡眠を主役に） ---------- */
  const conditionCard = (key) => {
    const g = state.settings.goals;
    const hv = healthView(state.health[key], key, key);
    const past = Array.from({ length: 7 }, (_, i) => addDays(key, i - 7)).map((d) => state.health[d]?.sleepMin).filter((v) => v != null);
    const avg = past.length ? mean(past) : null;
    const week = Array.from({ length: 7 }, (_, i) => addDays(key, i - 6)).map((d) => ({ key: d, v: state.health[d]?.sleepMin ?? null }));
    const scale = Math.max(g.sleepMin * 1.15, ...week.map((w) => w.v || 0));
    let verdict = '';
    let detail = '';
    if (hv.sleepMin != null) {
      const diff = hv.sleepMin - g.sleepMin;
      verdict = diff >= 0 ? 'よく眠れました。追い込める日' : diff >= -30 ? 'まずまず。いつもどおりでOK' : '少し足りません。無理のない範囲で';
      const vsGoal = diff >= 0 ? `目標 ${formatSleep(g.sleepMin)}を達成` : `目標まで あと ${fmtDur(-diff)}`;
      const vsAvg = avg != null ? ` ・ 直近7日の平均より ${hv.sleepMin - avg >= 0 ? '+' : '−'}${fmtDur(hv.sleepMin - avg)}` : '';
      detail = `${vsGoal}${vsAvg}`;
    }
    return html`
      <button class="card home-card cond-card rise" style="--i:1" data-act="condition">
        <div class="card-head"><div class="card-title" style="color:var(--c-sleep)">${icons.moon}<span>今日の調子 ・ 睡眠</span></div><span class="card-aside">${icons.rowChevron}</span></div>
        ${hv.sleepMin != null
          ? html`<div class="cond-main">
              <div>${sleepParts(hv.sleepMin)}<div class="cond-verdict">${verdict}</div><div class="cond-detail">${detail}</div></div>
              <div class="cond-week" aria-label="直近7日の睡眠">${week.map((w) => html`<i class="${w.key === key ? 'now' : ''} ${w.v != null && w.v >= g.sleepMin ? 'ok' : ''}" style="--h:${w.v != null ? Math.max(0.06, Math.min(1, w.v / scale)).toFixed(3) : 0}"></i>`)}</div>
            </div>`
          : html`<div class="cond-main"><div><div class="bignum xl faint">--</div><div class="cond-detail">睡眠がまだ同期されていません。下に引いて更新できます。</div></div></div>`}
      </button>`;
  };

  /* ---------- 食事の進み（残りを主役に） ---------- */
  const mealCard = (key) => {
    const g = state.settings.goals;
    const hv = healthView(state.health[key], key, key);
    const at = healthFetchedAt(key);
    const pRemain = hv.protein != null ? g.protein - hv.protein : null;
    const kcalTarget = g.kcal ?? hv.burned;
    const kRemain = hv.hasIntake && kcalTarget ? kcalTarget - hv.intake : null;
    const pct = (v, t) => `${(Math.max(0, Math.min(1, v / t)) * 100).toFixed(1)}%`;
    const rows = hv.shares
      ? [['P', 'var(--c-protein)', hv.shares.p], ['F', 'var(--c-fat)', hv.shares.f], ['C', 'var(--c-carb)', hv.shares.c]]
      : null;
    return html`
      <section class="card home-card rise" style="--i:2">
        <div class="card-head"><div class="card-title" style="color:var(--c-protein)">${icons.fork}<span>食事の進み</span></div><span class="card-aside">${at ? `${hhmm(at)} 更新` : ''}</span></div>
        ${hv.hasIntake || hv.protein != null
          ? html`<div class="meal-grid">
              <div class="meal-col">
                <div class="meal-big">${pRemain == null ? html`<span class="faint">--</span>` : pRemain > 0 ? html`あと <b>${fmtInt(pRemain)}</b><small>g</small>` : html`達成 <b>+${fmtInt(-pRemain)}</b><small>g</small>`}</div>
                <div class="meal-sub">タンパク質 ${hv.protein != null ? fmtInt(hv.protein) : '--'} / ${fmtInt(g.protein)} g</div>
                <div class="meal-bar"><i style="width:${hv.protein != null ? pct(hv.protein, g.protein) : '0%'};background:var(--c-protein)"></i></div>
              </div>
              <div class="meal-col">
                <div class="meal-big">${kRemain == null ? html`<span class="faint">--</span>` : kRemain >= 0 ? html`あと <b>${fmtInt(kRemain)}</b><small>kcal</small>` : html`<b>+${fmtInt(-kRemain)}</b><small>kcal</small> 超過`}</div>
                <div class="meal-sub">${hv.hasIntake ? `摂取 ${fmtInt(hv.intake)} ・ ${g.kcal ? '目標' : '消費'} ${fmtInt(kcalTarget)}` : '食事が未記録'}</div>
                <div class="meal-bar"><i style="width:${hv.hasIntake && kcalTarget ? pct(hv.intake, kcalTarget) : '0%'};background:var(--c-move)"></i></div>
              </div>
            </div>
            ${rows ? html`<div class="pfc-mini"><div class="pfc-bar sm">${rows.map(([, c, v]) => html`<i style="--w:${(v * 100).toFixed(1)}%;flex-basis:${(v * 100).toFixed(1)}%;background:${c}"></i>`)}</div>
              <div class="pfc-mini-k">${[['タンパク質', 'var(--c-protein)', hv.protein], ['脂質', 'var(--c-fat)', hv.fat], ['炭水化物', 'var(--c-carb)', hv.carb]].map(([l, c, v]) => html`<span><i style="background:${c}"></i>${l} ${fmtInt(v)}g</span>`)}</div></div>` : ''}
            ${hv.provisional && hv.burned != null && !g.kcal ? html`<p class="card-note">消費カロリーは今日の暫定値です。夜にかけて増えます。</p>` : ''}`
          : html`<div class="empty tight"><div class="s">今日の食事はまだ記録されていません。Fitbit に記録すると、1時間以内に反映されます。</div></div>`}
      </section>`;
  };

  /* ---------- トレーニング（今日の記録 or 次はこれ） ---------- */
  const trainingCard = (key) => {
    const day = state.training[key];
    const index = getIndex();
    if (day?.exercises.length) {
      const st = dayStats(day);
      const prCount = day.exercises.filter((ex) => {
        const s = sessionOn(index, ex.name, key);
        return s && (s.pr.rm || s.pr.weight || s.pr.reps);
      }).length;
      return html`
        <section class="card home-card rise" style="--i:3">
          <div class="card-head"><div class="card-title">${icons.dumbbell}<span>今日のトレーニング</span></div><div class="part-tags">${st.parts.map((p) => partTag(p))}</div></div>
          <div class="train-meta home-meta">
            <div><b>${st.exercises}</b><span>種目</span></div>
            <div><b>${st.sets}</b><span>セット</span></div>
            <div><b>${fmtInt(st.volume)}</b><span>kg</span></div>
            ${prCount ? html`<div class="gold"><b>${prCount}</b><span>PR</span></div>` : ''}
          </div>
          <div class="ex-list">${day.exercises.map((ex) => {
            const s = sessionOn(index, ex.name, key);
            const pr = s && (s.pr.rm || s.pr.weight || s.pr.reps);
            return html`<button class="ex" data-ex="${ex.name}">
              <div class="ex-head"><span class="ex-name">${ex.name}</span>${pr ? html`<span class="pr">${icons.star}PR</span>` : ''}<span class="spacer"></span>${icons.rowChevron}</div>
              ${ex.sets.length ? html`<div class="ex-sets">${ex.sets.map((st2) => setPill(st2))}</div>` : ''}
            </button>`;
          })}</div>
          <button class="btn btn-primary btn-block" data-act="log">${icons.dumbbell}続きを記録</button>
        </section>`;
    }

    // 次はこれ: 部位を「最後にやってから長い順」に並べる（やったことのない部位は最後）
    const last = lastDateByPart(state.training, addDays(key, 1));
    const parts = allParts().filter((p) => p !== OTHER_PART || last[p]);
    const ranked = parts
      .map((p) => ({ p, last: last[p] || null, gap: last[p] ? diffDays(key, last[p]) : null }))
      .sort((a, b) => (a.gap == null) - (b.gap == null) || (b.gap ?? 0) - (a.gap ?? 0));
    const pick = ranked.find((x) => x.p === selectedPart) || ranked[0];
    const lastDay = pick?.last ? state.training[pick.last] : null;
    const names = lastDay ? lastDay.exercises.filter((e) => partCategory(e.part || lastDay.part) === pick.p).map((e) => e.name) : [];
    const draft = hasDraft(key);
    return html`
      <section class="card home-card rise" style="--i:3">
        <div class="card-head"><div class="card-title">${icons.dumbbell}<span>次はこれ</span></div><span class="card-aside">最後にやってから長い順</span></div>
        <div class="chip-row next-parts" role="group" aria-label="部位">${ranked.map((x) => html`<button class="chip chip-2l" data-part="${x.p}" aria-pressed="${pick && x.p === pick.p}">
          <span class="chip-main"><i class="dot" style="background:${partColor(x.p)}"></i>${x.p}</span><span class="chip-sub">${x.gap == null ? '記録なし' : x.gap === 0 ? '今日' : `${x.gap}日前`}</span>
        </button>`)}</div>
        ${pick && lastDay
          ? html`<div class="next-prev"><span class="t-caption muted">前回 ${formatShort(pick.last)}</span><div class="next-names">${names.join('、')}</div></div>
            <div class="next-actions">
              <button class="btn btn-primary btn-block" data-act="same" data-part="${pick.p}">同じメニューで始める</button>
              <button class="btn btn-tinted btn-block" data-act="new" data-part="${pick.p}">新しく記録</button>
            </div>`
          : html`<div class="next-prev"><div class="next-names muted">${pick ? `${pick.p}の記録はまだありません。` : '部位がありません。設定から追加できます。'}</div></div>
            <button class="btn btn-primary btn-block" data-act="new" data-part="${pick?.p || ''}">記録する</button>`}
        ${draft ? html`<button class="link-btn draft-link" data-act="log">${icons.history}今日の下書きを続ける</button>` : ''}
      </section>`;
  };

  /* ---------- 最近の自己ベスト・今週 ---------- */
  const prCard = () => {
    const prs = recentPRs(getIndex(), 3);
    if (!prs.length) return '';
    return html`
      <section class="section rise" style="--i:4">
        <div class="section-head"><h2 class="section-title">最近の自己ベスト</h2><button class="link-btn" data-act="training">すべて見る</button></div>
        <div class="group">${prs.map((p) => html`<button class="row" data-ex="${p.name}">
          <i class="part-bar" style="background:${partColor(p.part)}"></i>
          <div class="row-body"><div class="row-title">${p.name}</div><div class="row-sub">${p.kind} ${p.unit === 'kg' ? fmtNum(p.value) : fmtInt(p.value)}${p.unit} ・ ${formatShort(p.date)}</div></div>
          <span class="pr">${icons.star}PR</span>${icons.rowChevron}
        </button>`)}</div>
      </section>`;
  };

  const weekCard = (key) => {
    const ws = startOfWeek(key);
    const cur = weekTotals(state.training, ws);
    const prev = weekTotals(state.training, addDays(ws, -7));
    const vol = (v) => (v >= 10000 ? `${fmtNum(v / 1000, 1)}t` : `${fmtInt(v)}kg`);
    return html`
      <section class="section rise" style="--i:5">
        <div class="section-head"><h2 class="section-title">今週</h2><span class="card-aside">${formatMD(ws)}〜</span></div>
        <div class="stat-trio">
          <button class="stat" data-act="training"><div class="stat-v">${cur.days}<small>回</small></div><div class="stat-k">先週 ${prev.days}回</div></button>
          <button class="stat" data-act="training"><div class="stat-v">${cur.sets}<small>セット</small></div><div class="stat-k">先週 ${prev.sets}</div></button>
          <button class="stat" data-act="training"><div class="stat-v">${cur.volume >= 10000 ? fmtNum(cur.volume / 1000, 1) : fmtInt(cur.volume)}<small>${cur.volume >= 10000 ? 't' : 'kg'}</small></div><div class="stat-k">先週 ${vol(prev.volume)}</div></button>
        </div>
      </section>`;
  };

  const render = () => {
    const key = todayKey();
    screen.setEyebrow(`${formatMD(key)} ${formatWeekdayLong(key)}`);
    if (!state.loaded && !Object.keys(state.training).length) {
      content.innerHTML = '<div class="skeleton" style="height:170px;border-radius:22px"></div><div class="skeleton" style="height:150px;border-radius:22px;margin-top:14px"></div><div class="skeleton" style="height:220px;border-radius:22px;margin-top:14px"></div>';
      return;
    }
    content.innerHTML = String(html`<div class="home-stack">${conditionCard(key)}${mealCard(key)}${trainingCard(key)}${prCard()}${weekCard(key)}</div>`);
    settleRise(content, !renderedOnce);
    renderedOnce = true;
    requestAnimationFrame(() => requestAnimationFrame(() => content.querySelectorAll('.cond-week i, .meal-bar i').forEach((i) => i.classList.add('on'))));
  };

  screen.el.addEventListener('click', (e) => {
    const chip = e.target.closest('.next-parts [data-part]');
    if (chip) {
      haptic.select();
      selectedPart = chip.dataset.part;
      render();
      return;
    }
    const ex = e.target.closest('[data-ex]');
    if (ex) {
      haptic.tap();
      router.navigate(`/exercise/${encodeURIComponent(ex.dataset.ex)}`);
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    const key = todayKey();
    if (a === 'settings') router.navigate('/settings');
    else if (a === 'condition') router.navigate('/condition');
    else if (a === 'training') router.navigate('/training');
    else if (a === 'log') router.navigate(`/log/${key}`);
    else if (a === 'same' || a === 'new') {
      haptic.tap();
      const part = act.dataset.part || '';
      let exercises = [];
      if (a === 'same') {
        const last = lastDateByPart(state.training, addDays(key, 1))[part];
        const day = last ? state.training[last] : null;
        exercises = day ? day.exercises.filter((x) => partCategory(x.part || day.part) === part).map((x) => x.name) : [];
      }
      setPrefill({ part, exercises });
      router.navigate(`/log/${key}`);
    }
  });

  const lazy = lazyUpdater(render);
  const offs = [on('data', lazy.request), on('settings', lazy.request)];
  render();
  return {
    el: screen.el,
    get date() {
      return todayKey();
    },
    onShow() {
      lazy.show();
      if (state.mode) refreshHealth(todayKey());
      // 日付が変わっていたら描き直す
      if (renderedOnce && screen.el.querySelector('.home-stack') && !document.hidden) render();
    },
    onHide: lazy.hide,
    destroy: () => offs.forEach((f) => f()),
  };
}

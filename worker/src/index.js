/**
 * GymMo3 の Cloudflare Worker。
 * - 画面（web/ の静的ファイル）を配信する。
 * - POST /api は GymMo2 の Worker（Service Binding）へそのまま転送する。データ・パスコード・Google 連携は GymMo2 と共有。
 * - /.well-known/assetlinks.json で Android アプリ（io.github.ygfoster.gymmo3）の App Links を認証する。
 */
const UPSTREAM = 'https://gymmo2.gymmo2.workers.dev/api';

/** Android アプリ（App Links）の所有確認。署名鍵は GymMo2 と同じ */
const ASSET_LINKS = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'io.github.ygfoster.gymmo3',
      sha256_cert_fingerprints: ['6F:DB:A5:9A:FA:08:4E:74:A6:2F:4B:EC:A2:2C:6E:11:5A:ED:2C:43:D8:F1:8C:5D:14:48:2B:38:F7:30:3B:2E'],
    },
  },
];

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api') {
      if (request.method !== 'POST') return json({ ok: true, app: 'GymMo3 API', note: 'POST のみ対応しています（GymMo2 の API へ転送します）。' });
      const body = await request.text();
      const init = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8', 'User-Agent': 'GymMo3-worker/1.0' }, body };
      try {
        // 本番は Service Binding。ローカル開発（wrangler dev）で binding が無いときは公開 URL へ
        const res = env.API ? await env.API.fetch(new Request(UPSTREAM, init)) : await fetch(UPSTREAM, init);
        return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      } catch (e) {
        return json({ ok: false, error: `API に接続できませんでした: ${e.message || e}` }, 502);
      }
    }
    if (url.pathname === '/.well-known/assetlinks.json') return json(ASSET_LINKS);
    return env.ASSETS.fetch(request);
  },
};

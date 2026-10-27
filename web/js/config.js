// アプリ設定。API のパスコード（トークン）はここに書かない（端末の localStorage にだけ保存する）。
export const CONFIG = {
  appName: 'GymMo3',
  version: '1.0.1',
  // API（Cloudflare Worker）。画面と同じ住所の /api なので、相対パスで指定する
  apiUrl: new URL('../api', import.meta.url).href, // js/config.js から見た ../api ＝ サイト直下の /api
  keyPrefix: 'gymmo3.',
};

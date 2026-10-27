// 画面をまたいで「次に開く記録画面に入れておく内容」を一度だけ受け渡す（ホームの「同じメニューで始める」など）。
let pending = null;

/** @param {{part?:string, exercises?:string[]}} prefill */
export function setPrefill(prefill) {
  pending = prefill || null;
}

/** 記録画面が開くときに 1 回だけ取り出す */
export function takePrefill() {
  const p = pending;
  pending = null;
  return p;
}

# GymMo3

GymMo2 を使い込んで出てきた不満（**探しにくさ・休憩タイマー・Fitbit データの見づらさ**）を起点に、画面と操作を作り直した筋トレ記録アプリ。
データ（記録・ヘルスデータ・パスコード・Google 連携）は **GymMo2 と共有**しているので、どちらで記録しても両方に出ます。

- 公開先: **https://gymmo3.gymmo2.workers.dev/**（Cloudflare Workers）
- 設計メモ: [docs/DESIGN.md](docs/DESIGN.md)（何を・なぜ変えたか）
- GymMo2: https://gymmo2.gymmo2.workers.dev/（リポジトリ ygfoster/GymMo2）

## 画面

| タブ | 内容 |
| --- | --- |
| ホーム | 今日の調子（睡眠を主役に、目標と週平均との差を一文で）／食事の進み（「あと ◯ g」「あと ◯ kcal」）／次はこれ（部位を最後にやってから長い順。前回のメニューで記録を開始）／最近の自己ベスト／今週 |
| トレーニング | 検索欄 1 つで種目・部位・メモ・日付を横断。履歴（月ごと・カレンダー表示）と種目（部位ごと、最終日・自己ベスト・推移）。種目の詳細に「この種目を記録」 |
| ダンベル（中央） | 記録シート。前回の値が薄く入っていて ✓ だけで採用。✓ で休憩タイマー自動開始。セットは左スワイプで削除 |
| コンディション | 週（7 列の棒・目標達成日数・平均）／月（ヒートマップ）／栄養バランス／トレ日と休息日の比較／睡眠と重量の関係 |
| 設定（ホーム右上） | 外観、触覚・効果音、休憩タイマー（終了を残す・催促・種目ごとの記憶）、部位と休憩時間、テンプレート、目標、書き出し、接続 |

休憩タイマーは、画面上端の進捗ラインでどの画面でも残りが見え、ドックの時間をタップするとその場で ±10/±30 秒とテンプレートを選べます。終了は「次のセット」を押すまで消えず、20 秒ごとに振動で催促します（設定でオフ可）。

## 開発

```bash
npm run serve        # http://127.0.0.1:5174 （web/ だけを配信。?demo でデモデータ）
npx wrangler dev     # http://127.0.0.1:8787 （画面 + /api。API は GymMo2 の公開 Worker へ転送）
npm test             # ユニットテスト
node scripts/offline-check.mjs   # Service Worker のオフライン起動を検証
npx wrangler deploy  # 本番へ公開
```

## 構成

```
web/        画面（ビルド不要の ES Modules）。lib/ の純粋ロジックは GymMo2 から流用、views/ は作り直し
worker/     Cloudflare Worker: 静的ファイルの配信 + /api を GymMo2 の Worker へ Service Binding で転送 + App Links
android/    Android アプリ（WebView + 通知で動く休憩タイマー）。パッケージ io.github.ygfoster.gymmo3
tests/      node --test
docs/       DESIGN.md
```

秘密情報（パスコード・Google の鍵）は GymMo3 のリポジトリにも Worker にもありません（すべて GymMo2 側）。

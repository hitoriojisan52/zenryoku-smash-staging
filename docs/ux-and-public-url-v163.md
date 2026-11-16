# v0.16.3 UI / 日付 / ビジター公開URL方針

## 反映先
- 検証用GitHub Pages `match.html`, `guest.html`, `live.html`, `match-view.html`
- GAS / Workerのコードは**今回変更していない**。本番LINE公式アカウントも変更していない。

## 1. ビジター閲覧画面
- ブラウザーのタイトルは「全力☆スマッシュ 対戦表」。
- ヘッダー左にタイトル、右に「🔄 更新」ボタン。
- 「ビジター閲覧専用・LINEログイン不要」および末尾の操作禁止・URL転送禁止の説明文は削除。
- 開催日・場所の表示は「第N試合進行中」の表示より前に配置。
- ボタン押下・自動更新中は更新ボタンを非活性化して「更新中…」と表示。通信終了時に元に戻す。

## 2. 日付の共通表示規則
- 表示する暦日は原則 `yyyy/MM/dd(曜)`。例：`2026/05/02(土)`、`2026/11/16(月)`。
- 全曜日（日月火水木金土）はグローバル共通ユーティリティ `date-format.js` でUTC日付演算で判定。
- 閲覧期限など日時の表示は `yyyy/MM/dd(曜) HH:mm`、Asia/Tokyo固定。
- API・Google Sheetsの内部値は従来の `YYYY-MM-DD` とISO 8601を維持。変換を保存値へ書き戻さない。
- 適用した表示箇所：対戦表開催日候補、ビジター開催情報・閲覧期限、QR発行画面の期限、運用管理の開催日候補・収支表の日付、別の閲覧用LIFF候補。
- HTML `input[type=date]` のネイティブ日付選択欄の見た目はブラウザ/端末のロケール依存。値は互換性のためISOを維持。今後の新規テキスト表示にも `date-format.js` を使用する。LINEメッセージの年月日等はGAS側の別処理なので今後同様に適用する。

## 3. 対戦表操作中の二重タップ防止
- 操作開始から完了まで `main.match-container.inert=true` にし、表示用オーバーレイに「処理中です…」とスピナーを表示。
- 操作中はボタン、セレクト、チェックボックス、設定画面の操作を受け付けない。完了/例外の`finally`で復元。
- すでにあった`S.busy`フラグと併用。複数イベントを並行して処理しない。
- 完了・失敗時には既存確認ダイアログ、メッセージ、最新データ表示を保持。
- 新規QR発行にも同じ処理中ロックを適用。ゲスト閲覧ページの更新には独立したボタンのロックを適用。
- この変更は視覚的・操作的なフィードバックが目的で、GASの通信時間そのものは短縮しない。
- 実機操作テストは未実施。権限別表示、進行、再生成、設定変更、通信エラーを検証する。

## 4. 公開URLのブランド名
検証用QR発行先は以下を維持：
`https://hitoriojisan52.github.io/zenryoku-smash-staging/guest.html#t=<token>`

GitHub Pagesの既定のホストはリポジトリ所有アカウント/組織名に依存するため、`hitoriojisan52`部分だけを書き換えても公開サイトにはならない。

本番でブランド名を使う選択肢：
1. GitHub Organization `zensuma` などを取得してその組織のPagesで公開（名称の利用可否確認が必要）。`zensuma.github.io`というホストを得るには`zensuma`名の所有アカウントが必要。
2. 所有する独自ドメインをGitHub Pagesで設定（例：`match.zensuma.jp`）。ドメインの登録・DNS設定が必要。
3. Cloudflare Pages等、別ホスティングでプロジェクト名由来のURLを発行（空き名と設定の確認が必要）。

公開先移行時は以下を**同時に更新**し、一致を確認すること：
- GitHub Pagesの実際のホストとパス
- GAS `AccessAndGuestV160.gs` の `SMA16.site`（QR発行で返却するURL）
- 公開フロントの `runtime-config.js` の `guestViewUrl`（正しいサイトへの発行先のみを許可する）
- Worker環境変数 `FRONTEND_ORIGIN`、必要なCORS設定
- 公開ページ `guest.html` のCSP `connect-src`、GAS/Workerの公開URL・Secretとの接続先
- LINE LIFFのエンドポイントURL（対戦表・運用管理アプリのホスト移行時）
- 有効な古いQRの取扱い：期限内は旧サイトも有効に保つか、新しいQRを配り直す

**検証環境のURLは今は切り替えない。** 本番で公開先が確定してから実施する。
GitHub公式文書：
- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages

## 5. 動作確認
- 新しいテスト用LIFF：`https://liff.line.me/2012602642-3FKiOTVx?v=163d`
- ビジター用は対戦表アプリの「閲覧QR」から**新しく発行したURL**で確認する。
- 一般メンバーに試合操作UIが出ないこと、当番・管理者では出ること、試合操作中はボタンが押せないことを確認する。

# v0.16.74 — 参加者一覧と集金管理の日付プルダウン統一・LINE後続検証

更新日：2026-11-20。対象は検証用main（本番は承認制）。

## 仕様の優先順位・影響

| 観点 | v0.16.73までの既存動作 | ユーザー指示とv0.16.74差分 | 保護する既存業務仕様 |
| --- | --- | --- | --- |
| 集金管理の日程 | 確定済みP行の開催日はプルダウンから除外。過去の未確定・確定解除日は直接選択可。通常初期表示は本日以降の直近 | **確定済みでも日本時間で当日と同じ開催日は表示**。前日以前の確定済み、および未来日の確定済みは除外。未確定・確定解除はすべて表示 | 確定済みの集金チェック・金額・収支修正のロックを解除しない。選択可能であることと編集可能であることを分離 |
| 参加者一覧の日程 | 未来日を通常表示、過去日は『履歴』ボタンで追加。財務状態による全日程フィルタなし | 集金管理と同じ対象を同じ日時/開始時刻/ID順でプルダウンへ。**参加者一覧の『履歴』ボタンを削除**。過去の未確定・解除済みは通常候補、確定済みは当日だけ表示。初期表示は本日以降の直近の対象日。表示名の『履歴：』を外す | 確定済み参加者行は従来通り修正・削除を非活性。対戦表生成済みなどの既存ロックも維持 |
| API情報 | overview APIはconfirmedPracticeIdsを返すが、participant/listには一覧全体の確定状態がない | participant/listにも**既存entries_の読込結果を再利用して**confirmedPracticeIdsを追加。extra Sheets read/writeなし。認証/権限/操作ログ、本文にLINEユーザーIDを含めない方針は不変 | 参加者の既存行、集金、会計、出欠履歴、試合進行は変更しない |
| 日付の境界 | 集金自動更新は確定状態の変化を検知、日付だけが変わるとUI候補が残る場合あり | JST日付キーを保持し、**深夜0時の切り替わり**でも確認状態が同じなら自動で候補を更新。参加者一覧は読込時にJSTの日付で再判定 | バックグラウンド8秒更新では全画面ロックしない。手動更新/保存時の画面ロックは不変更 |
| 別機能の履歴 | ビジター申請審査、会員退会など独立した履歴操作あり | **ビジター申請の履歴ボタン、退会履歴、会計履歴は削除しない** | 過去日の新規ビジター申請・対戦表生成などの別APIロックを緩和しない |

## 回帰テスト・受入

- 新 `tests/check-stage-participant-date-parity-v1674.cjs` は実GAS participantList_ の確定済みID、実集金管理reload()と実参加者一覧loadParticipants_()/participantDates_()をモックで起動し、未確定過去日、確定済み当日、確定済み過去日/未来日、確定解除後の再表示、初期値、手動選択の維持、JSTの日付切替、参加者修正ロックを検証する。
- v1666/v1664の過去のテストは、参加者一覧の『履歴』利用を前提にした断言を最新のユーザー指示へ更新する。ビジター履歴テストは変更しない。
- UI/GAS/仕様優先順位の全3系統CIと旧v15収支確定順序を再実行。検証main統合後にPages・GAS既存デプロイ・Cloudflare Workers Buildsを個別に確認する。
- UI実機の受入を免除したのは**v0.16.73の領収書表示のボタン整理**のみ。今回の日付選択とLINEの認証・通信・保存は実機未受入のまま成功と扱わない。

## LINE機能の後続検証（安全な順序）

1. **非破壊で自動確認可能：** LIFF起動先の公開ページ、Worker /healthのconfigured/channelMatchesLiveLiff、GitHub ActionsのLINE認証/本人参加連絡/ビジター/権限の単体・擬似連携テスト。CI合格はLINEサーバーからの実応答を証明しない。
2. **実機の認証・閲覧：** 検証用LIFF `https://liff.line.me/2012602642-XBSkXduO` でLINEログインが成立するか。管理者・当番担当・一般メンバーでの画面とメニュー、参加者一覧/集金プルダウン、確定済み当日の閲覧のみ・ボタン非活性、過去未確定日の表示を確認。テスト用参加日を使用し、実会員の情報を不必要に共有しない。
3. **実機の書込（検証用のみ）：** LINE認証済み本人による参加連絡の登録→修正→再表示、期限/確定/試合ロックを確認。ビジター申請→管理者承認→参加者一覧/当日の修正権限、操作ID・版数排他、二重送信/エラー復旧を順に確認。退会・再入会E2Eは独立の安全手順とテスト用アカウントに限定する。
4. **公式アカウント／リッチメニュー：** 既存LINE A/B/C（旧本番アカウント）と、新管理ツールで予定するユーザー別リッチメニュー/通知/Webhookの実装・本番切替を混同しない。既存資料 `docs/roles-and-rich-menu-v161.md` はユーザー別の自動メニュー切替を未実装と記録している。GitHub側のコード/模擬テストが通っても本番公式アカウントの実メニュー受入とはしない。
5. 実機が必要な工程は、認証済みユーザーが実際のLINEアプリで行う必要がある。秘密値/LINE IDトークン/個人ID/メンバー名はチャットへ共有しない。本人の確認結果は画面名・成功/失敗・エラー文だけで十分。

本番LINE公式アカウント/LIFF、GAS/Worker、Google Drive、会計・出欠・試合データを勝手に変更しない。

## 公開LINE経路の読み取り専用スモークテスト（追加）

- 新しい`stage-line-public-smoke.yml`は検証用mainへのコード反映後、公開Cloudflare WorkerのGET `/health`、公開GitHub PagesのGET `live.html`とGET `runtime-config.js`のみを取得する。
- `scripts/check-stage-line-public.mjs`が `ok=true`、`status=deployed`、`configured=true`、`channelMatchesLiveLiff=true`、管理LIFF IDとWorker URLの公開設定、および公開ページの`live.js`キャッシュ版がローカルmainと一致することを検証。機密値やレスポンス本文全文は出力しない。
- **本人のLINEトークンを取得しない・GASへのPOSTをしない・テスト用収支や参加者を登録しない**。公開ヘルスとフロント配信の検証結果を、認証を伴うLINE実機E2Eの完了と混同しない。
- GitHub公開への反映タイミングが前後した場合に備えて、短いリトライを設ける。エラーは安全な範囲のHTTP状態と検査条件だけを出す。成功判定と実機の確認結果を別管理。

## 実施済みCI・デプロイ・公開LINE疎通確認（2026/11/20 JST）

- v0.16.74の改修[PR #81](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/81)はUI・GAS・仕様CIすべて成功し、検証main `c6b2f8c50bb1791b6e002163eda89d498e00a71a` へ統合。日付パリティ18/18、LINE本人参加連絡25/25、旧v15収支確定順序28/28、ビジター関連CIすべて成功。
- 同mainの[GitHub Pages実デプロイ](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44565706874)、[GAS既存デプロイ@41](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44565707792)、Cloudflare Workers Buildsすべて成功。GASは同じデプロイID、Workerコードは未変更。
- 公開経路テスト[PR #82](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/82)をCI成功後に検証main `bd325142c9b65fff5602fa5c8d1a735df41c8b20` へ統合。対応する[Staging LINE public read-only smoke](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44567090177)は**success**。公開Workerの `ok:true` / `status:deployed` / `configured:true` / `channelMatchesLiveLiff:true`、実GitHub Pagesの版数と公開LIFF設定一致を確認。公開Worker識別子 `stage-v1665-receipt-upload-20261119` はWorker本体が従来版のままのため想定範囲。
- 検証用Sheet「操作履歴」の操作種別列 B1:B300 を**読み取り専用**で確認。データ170件に `attendance.submit` の記録なし（2026/11/20時点）。認証済みLINE端末での出欠登録→修正→一覧への反映が成功したことを示す記録は、この範囲からは確認できない。過去の記録の種類からLINEログイン完了やWebhook疎通を推定しない。
- **未受入**：LINEアプリでの本人認証・再ログイン、一般メンバー／当番／管理者の役割別権限、実データへの出欠登録・修正、ビジター承認反映、退会・再入会（独立の安全手順）、ユーザー別リッチメニューの切替とWebhook応答。公式アカウントの新メニュー自動切替は既存資料上、未実装/要確認のため成功扱いしない。
- 次の操作は、管理者本人の検証用LINEから**テスト用の日程**で参加連絡を1件送信し、同じ日程・同じ本人の出欠/備考を修正し、参加者一覧・操作履歴に反映されたことを確認すること。トークン・LINEユーザーID・氏名など個人識別情報の共有は求めない。書込試験は検証環境限定、本番変更禁止。

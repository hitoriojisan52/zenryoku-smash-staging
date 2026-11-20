# v0.16.80 — 検証専用の自己権限切換・メンバー操作禁止・メッセージ色統一

2026/11/20。ユーザーの実機確認報告と明示仕様変更に基づく。**検証環境のみ。本番投入時はこの権限切換機能とAPIを完全に削除する。**

## 確定仕様（v0.16.79からの更新）

| 項目 | 既存仕様・相違点 | 今回の仕様・影響評価・保護 |
| --- | --- | --- |
| ビジター申請取消 | 承認待ちの申請者本人は「削除」（引き戻し）可能。承認済みは不可 | **維持確定**。申請者が承認待ち申請を取り消せる。他人の申請、承認済みは取り消せない。参加者一覧のビジター削除は禁止、承認済みの削除は管理者「ビジター管理→却下」に限定する |
| 権限表示プレビュー | v0.16.79では実権限は不変の見本 | **ユーザーの明示変更により実際の自己権限変更へ置換**。本人の検証用LINE認証のみ、本人が一度管理者で検証対象に登録されると、当番担当・メンバーから本人だけが管理者へ復帰可能 |
| 管理者の自己権限変更禁止 | 通常の`member.manage.role`は管理者本人のUI変更が不可、最後の管理者保護 | **通常の権限管理は不変**。別の検証専用`stage.selfRole`だけを新設。本人の最初の管理者→降格で本人IDをGASスクリプトプロパティに一度だけ固定し、他人からの昇格は拒否する。ステージング環境ID・既存のGAS/Worker検証専用有効化フラグ・LINE本人照合・別の有効な架空管理者を二重に検証。 |
| 最後の管理者 | 最後の管理者は降格不可 | **維持**。「架空利用者修正1657」（既存の固定ID）がactiveかつisAdminかを毎回サーバー側で照合し、現在の管理者が自分の権限を下げても別の管理者が残ることを確認。メンバー・当番担当から管理者への復帰は、既登録の本人だけ許す。架空管理者の本人ID・権限は一切変更しない |
| メンバーで運用管理LIFF起動 | これまでは一般メンバーにLINE参加連絡/ビジター申請ボタンを表示 | **運用管理LIFFホームはすべての通常ボタン・入力・選択と運用管理メニューを非活性**。ただし上部の🧪権限切換は利用可能。別のLINE参加連絡入口（?visitor=1）は従来の申請・出欠機能を維持 |
| 権限切換ボタン位置 | 検証用メニューにプレビュー | **ホーム画面の立替精算ボタンの左側**。旧プレビュー専用メニューボタンは削除。管理者/当番担当/メンバーともログイン成功後に押せる |
| メッセージ表示 | 青・黄・赤枠は以前からあるが絵文字のある警告とない警告が混在 | **青：処理中・読込状況（既存CSSスピナー）、黄：⚠️付きの警告、赤：エラー**。yellow系の共通メッセージはCSS疑似要素で⚠️を付与し、既存の現金確認メッセージに重複する文字の絵文字は外す。画面内通信失敗、管理者読込失敗、共通エラーモーダルは赤枠にする |

## 独立した安全境界

- API: `POST /api/stage/self-role`→Worker検証済みLINE IDトークン→GAS `stage.selfRole`。クライアントは操作`status`または`change`、変更後role/期待する旧role/操作IDだけを送る。他人のmemberIdやLINE IDを指定できない。
- Worker：既存の検証用WORKER_PURPOSE、WITHDRAW_ENABLED、検証用Workbook ID、固定GitHub Pages Origin、固定LINEチャネルIDと正規UUIDを要求。GAS：同じ検証用ScriptProperties目的とWorkbook ID、`member_`による本人照合、`LockService`、`操作履歴`による重複防止、last admin保護を独立検証。通常の本番仕様・管理者操作APIに特例を追加しない。
- 初回の検証対象登録は、本人が実際に管理者で、別の管理者「架空利用者修正1657」が存在し、有効なときの**最初の自己降格**で行う。GAS ScriptProperties `STAGE_SELF_ROLE_OWNER_MEMBER_V1680` に登録した1名だけが復帰でき、検証対象を変更するUI/APIを作らない。IDをレスポンスに公開しない。
- 変更時は確認ダイアログ1回、保存中は既存の全画面ロック、通信断での自動リトライ禁止。成功後に`/api/session`の値を検証し画面リロード。変更結果不明時は読み直しを促し、重複リクエストを送らない。
- 通常の`member.manage.role`の管理者のみ編集・自己変更禁止・一人管理者保護は維持。会計確定順序、残高、ビジター却下/取消、メンバー/退会/試合、監査記録の既存制約は変更しない。
- **本番移行時に消す対象**：ホームの権限切換ボタンと確認ダイアログ、stage-role-preview.jsの自己権限変更、Worker /api/stage/self-role、GAS accessStageSelfRoleV1680_、関連ScriptProperty。検証用URL/ID/秘密情報を本番へ持ち込まない。

## テスト・実機受入

- 回帰：`tests/check-stage-self-role-v1680.cjs` でGAS実関数のステージング境界、初回登録、実際のadmin→member/duty、member/duty→admin復帰、他人の昇格拒否、架空管理者/最終管理者、リプレイ時の二重操作防止、Worker・UIの契約を模擬検証。
- `check-stage-role-preview-visitor-delete-v1679.cjs`はユーザー指示によるプレビュー廃止を反映し、v0.16.79のビジターの却下のみの削除境界と未承認申請の本人取消を引き続き検証。旧会計・現金確認・権限/退会・対戦表の回帰も実行。
- **LINE実機は別途確認**： [検証用運用管理LIFF](https://liff.line.me/2012602642-XBSkXduO) を開く。(1) 左上部の権限切換（立替精算の左）が有効 (2) 管理者→当番担当で管理者メニューが使えない (3) 当番担当→メンバーで運用管理ボタンが全て非活性、権限切換だけ有効 (4) メンバー→管理者に戻る (5) ビジター申請の承認待ち削除維持／承認済み削除不可 (6) 警告の⚠️・色と赤枠エラー表示。
- GAS・Workerの自動デプロイ合格と実機による変更成功は区別する。実機での権限変更はユーザーが実行。ユーザーの事前承認なしに本番環境へ反映しない。

## v0.16.80 — 統合・CI・自動デプロイ検証（2026/11/20）

- [PR #94](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/94) を検証用mainへ統合（SHA `87f7b42eb6fb4d0e0454c9e5eede73920f44a3c7`）。UI/GAS安全性/仕様優先順位の**3系統CI合格**。
- 新規`check-stage-self-role-v1680.cjs` **28/28件**、更新後の本人ロール・ビジター削除境界 **18/18件**、ビジター審査 **75/75件**、旧会計確定順序 **28/28件** の模擬回帰成功。
- [GitHub Pages](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44679284922) build/deploy成功。[Cloudflare Workers Builds](https://github.com/hitoriojisan52/zenryoku-smash-staging/commit/87f7b42eb6fb4d0e0454c9e5eede73920f44a3c7/checks)成功。Worker本体のステージ権限切換APIルーティング・検証ゲート変更が公開された。
- [検証GAS既存Webアプリ](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44679286891)の更新成功。既存デプロイ **@46**（ログ `Redeployed *** @46`）。コード.gs・AccessAndGuestV160.gsのpush後source sha256照合成功。新規Webアプリ・本番GASは作成/更新していない。
- [公開LIFF/Worker GET-onlyスモーク](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44679286916)成功。ただしLINE IDトークンを使った新`stage.selfRole` API status/changeや実役割変更は、この公開GET-only試験の対象外。
- **LINE実機受入は未完了**。ユーザーの管理者→当番担当→メンバー→管理者の実操作、メンバー時の非活性、ビジター本人の承認待ち取下げ、黄枠⚠️/赤枠エラーを検証する。実機用リンク：[検証用運用管理LIFF](https://liff.line.me/2012602642-XBSkXduO)。本番変更なし。

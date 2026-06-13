# interview-scheduler プロジェクト概要（Claude 自動読込）

このファイルは Claude Code が新セッション起動時に自動で読み込むプロジェクト文脈。

## 🎯 何のプロジェクトか
人材紹介の **3者（求職者・エージェント・事業所）が、チャット形式で面接日程を調整する** Webアプリの MVP。
候補日時をボタンで提示し、各自が ⭕🔺❌ で回答 → 全員⭕の枠が緑にハイライト → エージェントが確定する。

## 🧱 技術スタック（重要・逸脱しないこと）
- **素の HTML / CSS / JavaScript（jQuery）** ＋ **Firebase Realtime Database**（v9 モジュール・CDN読み込み）
- **ビルド工程なし**（`index.html` をブラウザで開けば動く）
- ⚠️ **作者は HTML/CSS/JS を学習中**（G'sアカデミー）。**React等の重いフレームワーク・npm・ビルドツールの導入は避ける。** 読んで理解できる素の実装を保つ。

## 📂 構造
```
index.html          画面のマークアップ ＋ アプリのJS（同一ファイル内）
css/style.css       見た目（デザイン）
docs/
  データ設計.md          Realtime DB のデータ構造（正本）
  企画引き継ぎ書.md       事業の背景・課題整理
  design-session-brief.md デザイン専任セッションの起動キット
```

## 🌐 公開
- リポジトリ：https://github.com/shuya-azumi/scheduler
- GitHub Pages：https://shuya-azumi.github.io/scheduler/

## 👥 セッション体制（役割分担）
このプロジェクトは複数セッションで進める。**自分がどの役割かを最初に確認**すること。

| 役割 | 担当範囲 | 主に触るファイル |
|---|---|---|
| 🔵 **機能セッション**（主） | 仕様・ロジック(JS)・Firebaseデータ構造・バグ修正 | `index.html` の `<script>`、`docs/データ設計.md` |
| 🎨 **デザインセッション** | 見た目・UI/UX・配色・タイポ・レイアウト・HTMLマークアップ | `css/style.css`、`index.html` のHTML部分 |

### ⚠️ ファイル衝突回避ルール
- `index.html` は両者が触る可能性がある共有ファイル。**機能＝`<script>`内、デザイン＝それ以外のHTML**、と棲み分ける。
- 大きな変更の前に、相手セッションの作業状況を確認する（`docs/` のハンドオフ更新 or セッション間メッセージ）。
- **データ構造（`docs/データ設計.md`）の変更は機能セッションの管轄。** デザインセッションは勝手に変えない。

## 📌 前提・注意
- Firebase の `firebaseConfig`（apiKey含む）はWebアプリでは公開前提の値。コミット済みでOK。
- 現状の Realtime DB ルールは検証用に開いている（誰でも読み書き可）。本番化前に締める。

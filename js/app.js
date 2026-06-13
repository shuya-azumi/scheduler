// =====================================================================
// 面接日程調整アプリ — アプリ本体（JavaScript）
// もとは index.html の <script type="module"> に直接書いていたものを、
// このファイルに分離した（中身は変更なし）。
// index.html からは <script type="module" src="js/app.js"></script> で読み込む。
// =====================================================================

// --- Firebase v9 モジュール読み込み（講義と同じCDN）---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.1.0/firebase-app.js";
import {
  getDatabase, ref, push, set, update, onValue, onChildAdded
} from "https://www.gstatic.com/firebasejs/9.1.0/firebase-database.js";

// ========================================================
// ★ここに自分の Firebase の設定を貼り付けてください★
//   Firebaseコンソール →「プロジェクトの設定」→「マイアプリ」で取得
//   ※Realtime Database を作成し、ルールを一旦テストモード
//     （ "読み取り/書き込み" を許可）にしておくこと
// ========================================================
const firebaseConfig = {
  apiKey: "AIzaSyBSdOz97Zs5T0Z1nAxePtJJzDXBRgDb-_8",
  authDomain: "scheduler-be973.firebaseapp.com",
  databaseURL: "https://scheduler-be973-default-rtdb.firebaseio.com",
  projectId: "scheduler-be973",
  storageBucket: "scheduler-be973.firebasestorage.app",
  messagingSenderId: "11052609379",
  appId: "1:11052609379:web:fff3005e3846919d9fad56"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- 役割の表示名 ---
const ROLE_LABEL = { candidate: "求職者", agent: "エージェント", facility: "事業所" };

// --- 役割アイコン（インラインSVGの線アイコン。色は currentColor を継承＝配色は変えない）---
//   求職者＝人、事業所＝建物、エージェント＝ブリーフケース
const ROLE_ICON = {
  candidate: '<svg class="role-ico role-candidate" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5"/></svg>',
  facility:  '<svg class="role-ico role-facility" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="1"/><path d="M8.5 7.5h2M13.5 7.5h2M8.5 11.5h2M13.5 11.5h2"/><path d="M10 20.5v-3.5h4v3.5"/></svg>',
  agent:     '<svg class="role-ico role-agent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5"/><path d="M3 13h18"/></svg>'
};
function roleIcon(role) { return ROLE_ICON[role] || ""; }

// --- ルームIDを URL から取得。無ければ作ってURLに付ける ---
const params = new URLSearchParams(location.search);
let roomId = params.get("room");
if (!roomId) {
  roomId = "room_" + Math.random().toString(36).slice(2, 9);
  params.set("room", roomId);
  history.replaceState(null, "", location.pathname + "?" + params.toString());
}
$("#room-label").text(roomId);

// --- このルーム配下への参照 ---
const roomRef = ref(db, "rooms/" + roomId);
const infoRef = ref(db, "rooms/" + roomId + "/info");
const membersRef = ref(db, "rooms/" + roomId + "/members");
const slotsRef = ref(db, "rooms/" + roomId + "/slots");
const votesRef = ref(db, "rooms/" + roomId + "/votes");
const messagesRef = ref(db, "rooms/" + roomId + "/messages");

// --- 画面に保持しておく最新データ ---
let me = null;                 // { id, name, role }
let info = {};                 // info ノード
let members = {};              // members ノード
let slots = {};                // slots ノード
let votes = {};                // votes ノード

// ========== 参加画面の操作 ==========
let selectedRole = null;

$(".role-btn").on("click", function () {
  selectedRole = $(this).data("role");
  $(".role-btn").removeClass("selected");
  $(this).addClass("selected");
  refreshJoinBtn();
});
$("#join-name").on("input", refreshJoinBtn);
function refreshJoinBtn() {
  const ok = $("#join-name").val().trim() !== "" && selectedRole;
  $("#join-btn").prop("disabled", !ok);
}

// 参加した人は sessionStorage で記憶（タブ単位。リロードでは保持／別ウィンドウは別人）
// ※ localStorage だとブラウザ全体（シークレットの別窓含む）で共有され、
//   別の役割で入り直せない問題が起きるため sessionStorage を使う
const savedKey = "scheduler_member_" + roomId;
const saved = sessionStorage.getItem(savedKey);
if (saved) {
  me = JSON.parse(saved);
  enterMainScreen();
}

$("#join-btn").on("click", function () {
  const name = $("#join-name").val().trim();
  // ① ルーム参加 = members に push
  const newMemberRef = push(membersRef);
  const memberId = newMemberRef.key;
  set(newMemberRef, { name: name, role: selectedRole });

  me = { id: memberId, name: name, role: selectedRole };
  sessionStorage.setItem(savedKey, JSON.stringify(me));

  // タイトルがまだ無ければ初期化（最初に入った人が作る）
  onValueOnce(infoRef, (val) => {
    if (!val) {
      set(infoRef, {
        title: "面接 日程調整",
        status: "adjusting",
        confirmedSlotId: "",
        createdAt: Date.now()
      });
    }
  });

  // 参加メッセージを流す（type=system）
  pushMessage("system", name + "（" + ROLE_LABEL[selectedRole] + "）が参加しました", "");
  enterMainScreen();
});

// ========== メイン画面へ ==========
function enterMainScreen() {
  $("#join-screen").addClass("hidden");
  $("#main-screen").removeClass("hidden");
  $("#me-label").html(roleIcon(me.role) +
    '<span class="me-name">' + escapeHtml(me.name) + '</span>' +
    '<span class="me-role role-' + me.role + '">' + ROLE_LABEL[me.role] + '</span>');

  // エージェントだけ「枠追加」フォームを表示
  if (me.role === "agent") $("#add-slot-box").removeClass("hidden");

  startListeners();
  renderQuickReplies();
}

// ========== リアルタイム購読 ==========
function startListeners() {
  // info / members / slots / votes は onValue（変化したらパネル再描画）
  onValue(infoRef, (snap) => { info = snap.val() || {}; renderInfo(); renderSlots(); });
  onValue(membersRef, (snap) => { members = snap.val() || {}; renderSlots(); renderQuickReplies(); });
  onValue(slotsRef, (snap) => { slots = snap.val() || {}; renderSlots(); });
  onValue(votesRef, (snap) => { votes = snap.val() || {}; renderSlots(); });

  // messages は onChildAdded（新着を下に積む＝講義チャットと同じ）
  onChildAdded(messagesRef, (snap) => {
    const m = snap.val();
    appendMessage(m);
  });
}

// ========== 候補枠パネルの描画 ==========
function renderSlots() {
  const $slots = $("#slots").empty();
  const memberIds = Object.keys(members);
  // 投票するのは求職者・事業所のみ（エージェントは打診役なので投票しない）
  const voterIds = memberIds.filter(id => members[id].role !== "agent");
  // 候補を日時（start）の早い順に並べる
  const slotIds = Object.keys(slots).sort((a, b) =>
    (slots[a].start || "").localeCompare(slots[b].start || ""));

  if (slotIds.length === 0) {
    $slots.append('<p class="empty">まだ候補がありません。' +
      (me.role === "agent" ? "下のフォームから追加してください。" : "エージェントの追加を待っています。") + '</p>');
    return;
  }

  slotIds.forEach((slotId) => {
    const slot = slots[slotId];
    const slotVotes = votes[slotId] || {};

    // この枠に「求職者・事業所が全員」 ok か？（エージェントは除外）
    const allOk = voterIds.length > 0 && voterIds.every(id => slotVotes[id] === "ok");
    const isConfirmed = info.confirmedSlotId === slotId;

    const $card = $('<div class="slot-card"></div>');
    if (allOk) $card.addClass("all-ok");
    if (isConfirmed) $card.addClass("confirmed");

    $card.append('<div class="slot-label">' + escapeHtml(slot.label) +
      (isConfirmed ? ' <span class="badge">確定</span>' : (allOk ? ' <span class="badge ok">全員参加可</span>' : '')) +
      '</div>');

    // 求職者・事業所の○×表示（エージェントは投票しないので除外）
    const $status = $('<div class="vote-status"></div>');
    voterIds.forEach(id => {
      const v = slotVotes[id];
      const mark = v === "ok" ? "参加可" : v === "ng" ? "不可" : "未回答";
      $status.append('<span class="vote-chip">' + roleIcon(members[id].role) +
        escapeHtml(members[id].name) + '：' + mark + '</span>');
    });
    $card.append($status);

    // 自分の投票ボタン（投票するのは求職者・事業所のみ。エージェントは打診役なので非表示）
    if (me.role !== "agent") {
      const myVote = slotVotes[me.id];
      const $btns = $('<div class="vote-btns"></div>');
      $btns.append(voteBtn(slotId, "ok", "参加可", myVote));
      $btns.append(voteBtn(slotId, "ng", "不可", myVote));
      $card.append($btns);
    }

    // エージェントだけ：確定の操作
    if (me.role === "agent") {
      if (isConfirmed) {
        // この枠が現在の確定枠 → 解除ボタン
        const $unconfirm = $('<button class="unconfirm-btn">確定を解除する</button>');
        $unconfirm.on("click", () => unconfirmSlot(slot.label));
        $card.append($unconfirm);
      } else {
        // それ以外の枠 → 他が確定済みでも、いつでも確定（＝確定先を切り替えできる）
        const $confirm = $('<button class="confirm-btn">この枠で確定する</button>');
        $confirm.on("click", () => confirmSlot(slotId, slot.label));
        $card.append($confirm);
      }
    }

    $slots.append($card);
  });
}

function voteBtn(slotId, value, text, myVote) {
  const $b = $('<button class="vote-btn"></button>').text(text);
  if (myVote === value) $b.addClass("active");
  $b.on("click", () => vote(slotId, value));
  return $b;
}

// ========== 操作：② 候補枠を出す（エージェント）==========
$("#add-slot-btn").on("click", function () {
  const date = $("#slot-date").val();    // 例 "2026-06-16"
  const start = $("#slot-start").val();  // 例 "13:00"
  const end = $("#slot-end").val();      // 例 "14:00"
  if (!date || !start) { alert("日付と開始時刻を入力してください"); return; }
  if (end && end <= start) { alert("終了時刻は開始時刻より後にしてください"); return; }

  // 表示用ラベルを自動で組み立てる（例：6/16(月) 13:00〜14:00）
  const label = formatSlotLabel(date, start, end);
  // slots に push（start/end も構造化して保存）
  const newSlotRef = push(slotsRef);
  set(newSlotRef, {
    label: label,
    start: date + "T" + start,
    end: end ? date + "T" + end : ""
  });
  pushMessage("system", "候補「" + label + "」が追加されました", newSlotRef.key);
  $("#slot-date").val(""); $("#slot-start").val(""); $("#slot-end").val("");
});

// ========== 操作：③ 枠に○×（全員）==========
function vote(slotId, value) {
  // (1) 状態を上書き：votes/{slotId}/{自分id} を set
  set(ref(db, "rooms/" + roomId + "/votes/" + slotId + "/" + me.id), value);
  // (2) チャットに流す：messages に push
  const slot = slots[slotId];
  const mark = value === "ok" ? "参加可" : "不可";
  pushMessage("vote", "「" + (slot ? slot.label : "") + "」→ " + mark, slotId);
}

// ========== 操作：④ 確定（エージェント）==========
function confirmSlot(slotId, label) {
  // すでに別の枠が確定済みなら「変更」扱い
  const changing = info.status === "confirmed" && info.confirmedSlotId && info.confirmedSlotId !== slotId;
  const ask = changing
    ? "確定を「" + label + "」に変更します。よろしいですか？"
    : "「" + label + "」で確定します。よろしいですか？";
  if (!confirm(ask)) return;
  // info を update（確定先を切り替え）
  update(infoRef, { status: "confirmed", confirmedSlotId: slotId });
  pushMessage("confirm",
    (changing ? "面接日時を「" + label + "」に変更しました" : "面接日時が「" + label + "」に確定しました"),
    slotId);
}

// 確定の解除（再調整に戻す）
function unconfirmSlot(label) {
  if (!confirm("「" + label + "」の確定を解除して再調整に戻します。よろしいですか？")) return;
  update(infoRef, { status: "adjusting", confirmedSlotId: "" });
  pushMessage("system", "確定を解除しました（再調整に戻ります）", "");
}

// ========== チャット ==========
$("#send-btn").on("click", sendText);
$("#chat-text").on("keydown", (e) => { if (e.keyCode === 13) sendText(); });
function sendText() {
  const text = $("#chat-text").val().trim();
  if (!text) return;
  pushMessage("text", text, "");
  $("#chat-text").val("");
}

// ===== 定型文（クイック返信）=====
// 求職者の名前を取得（宛名差し込み用）。members（ID→{name,role}）から role=candidate を探す
function candidateName() {
  const id = Object.keys(members).find(mid => members[mid].role === "candidate");
  return id ? members[id].name : "";
}

// 役割ごとの定型文を表示。クリックでそのまま送信する
function renderQuickReplies() {
  const $box = $("#quick-replies").empty();
  const cName = candidateName();
  const honor = cName ? cName + "様" : "皆様";   // 求職者がまだ未参加なら「皆様」
  let presets;
  if (me.role === "agent") {
    presets = [
      honor + "、こちらの日程はいかがでしょうか？",
      honor + "、ご都合のよい時間に「参加可」をお願いします。",
      "ありがとうございます。事業所へ確認いたします。"
    ];
  } else if (me.role === "candidate") {
    presets = ["こちらで大丈夫です", "この時間にいけます", "確認して折り返します", "ありがとうございます"];
  } else { // facility（事業所）
    presets = ["この日程で問題ありません", "対応可能です", "確認します", "ありがとうございます"];
  }
  presets.forEach((text) => {
    const $chip = $('<button class="quick-chip"></button>').text(text);
    $chip.on("click", () => pushMessage("text", text, ""));
    $box.append($chip);
  });
}

function pushMessage(type, text, slotId) {
  const newMsgRef = push(messagesRef);
  set(newMsgRef, {
    name: me ? me.name : "（システム）",
    role: me ? me.role : "",
    type: type,
    text: text,
    slotId: slotId || "",
    createdAt: Date.now()
  });
}

function appendMessage(m) {
  const $box = $("#messages");
  let html;
  if (m.type === "system") {
    html = '<div class="msg system">' + escapeHtml(m.text) + '</div>';
  } else if (m.type === "confirm") {
    html = '<div class="msg confirm">' + escapeHtml(m.text) + '</div>';
  } else {
    const mine = me && m.name === me.name ? " mine" : "";
    const roleTag = m.role ? '<span class="role-tag">' + roleIcon(m.role) + (ROLE_LABEL[m.role] || "") + '</span>' : '';
    html = '<div class="msg bubble' + mine + '">' +
      '<div class="msg-name">' + escapeHtml(m.name) + ' ' + roleTag + '</div>' +
      '<div class="msg-text">' + escapeHtml(m.text) + '</div></div>';
  }
  $box.append(html);
  $box.scrollTop($box[0].scrollHeight);
}

// ========== 確定バナー ==========
function renderInfo() {
  $("#main-title").text(info.title || "面接 日程調整");
  if (info.status === "confirmed" && info.confirmedSlotId && slots[info.confirmedSlotId]) {
    $("#confirmed-banner")
      .text("確定：" + slots[info.confirmedSlotId].label)
      .removeClass("hidden");
  } else {
    $("#confirmed-banner").addClass("hidden");
  }
}

// ========== 招待URLコピー ==========
$("#copy-url").on("click", function () {
  navigator.clipboard.writeText(location.href)
    .then(() => { $(this).text("コピーしました！"); setTimeout(() => $(this).text("招待URLをコピー"), 1500); });
});

// 退出（別の役割で入り直す）：自分の記憶を消し、DBからも自分を削除して参加画面へ戻す
$("#leave-btn").on("click", function () {
  if (!confirm("このルームから退出して、役割を選び直しますか？")) return;
  // DBから自分のメンバー情報を削除（残すと「全員OK」判定に影響するため）
  if (me) set(ref(db, "rooms/" + roomId + "/members/" + me.id), null);
  sessionStorage.removeItem(savedKey);
  location.reload();
});

// ========== 小道具 ==========
// 時刻プルダウンを15分刻みで生成（8:00〜21:00）。30分刻みにしたい場合は step を 30 に変える
(function buildTimeOptions() {
  const step = 15;            // ← 15分刻み（30にすれば30分刻み）
  const fromHour = 8, toHour = 21;
  let opts = '<option value="">--:--</option>';
  for (let h = fromHour; h <= toHour; h++) {
    for (let m = 0; m < 60; m += step) {
      const t = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
      opts += '<option value="' + t + '">' + t + '</option>';
    }
  }
  $("#slot-start").html(opts);
  $("#slot-end").html(opts);
})();

// 日付＋時刻 → 「6/16(月) 13:00〜14:00」の表示用文字列を作る
function formatSlotLabel(date, start, end) {
  const d = new Date(date + "T00:00");
  const week = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  const md = (d.getMonth() + 1) + "/" + d.getDate() + "(" + week + ")";
  return md + " " + start + (end ? "〜" + end : "");
}

// info が存在するか1回だけ確認するヘルパー
function onValueOnce(r, cb) {
  const unsub = onValue(r, (snap) => { cb(snap.val()); unsub(); });
}
// XSS対策：入力文字をそのままHTMLに入れない
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

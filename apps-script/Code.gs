/**
 * Code.gs — 리비 길드 레이드 스케줄러 백엔드 (Google Apps Script)
 *
 * 이 스크립트는 구글 시트에 붙여 "웹앱"으로 배포합니다.
 * 정적 사이트(GitHub Pages)가 이 웹앱 URL 로 데이터를 읽고/쓰기 합니다.
 *
 * ── 시트 구성 (탭 3개, 첫 행은 헤더) ──────────────────────────
 *  [길드원]  A:캐릭터명  B:클래스
 *  [설정]    A:키        B:값        (예: 기본시간 = 21:00 / 마감시간 = 21:00)
 *  [투표]    A:주차  B:캐릭터명  C:참석여부  D:시간  E:전투력  F:업데이트시각
 *            ※ [투표] 탭은 비어있어도 됩니다(스크립트가 헤더 자동 생성).
 *
 * ── 설치 ────────────────────────────────────────────────────
 *  1) 시트 메뉴 → 확장 프로그램 → Apps Script 에 이 코드 붙여넣기
 *  2) (권장) 프로젝트 설정에서 시간대를 'Asia/Seoul' 로 지정
 *  3) 배포 → 새 배포 → 유형:웹앱 → 실행:나 / 액세스:모든 사용자 → 배포
 *  4) 나온 웹앱 URL(.../exec)을 js/config.js 의 APPS_SCRIPT_URL 에 붙여넣기
 */

var SHEET_MEMBERS = '길드원';
var SHEET_CONFIG  = '설정';
var SHEET_VOTES   = '투표';
var TZ = 'Asia/Seoul';

/* ───────── 진입점 ───────── */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'getData';
  if (action === 'getData') return json(getData());
  return json({ ok: false, error: 'unknown action' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'vote') return json(submitVote(body.payload));
    return json({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/* ───────── 핵심 로직 ───────── */

function getData() {
  var cfg = readConfig();
  var monday = upcomingMonday();
  var weekId = fmt(monday, 'yyyy-MM-dd');
  var deadline = deadlineOf(monday, cfg.마감시간);

  return {
    contentDate: weekId,
    deadline: deadline.toISOString(),
    isClosed: new Date() > deadline,
    defaultTime: cfg.기본시간 || '21:00',
    members: readMembers(),
    votes: readVotes(weekId)
  };
}

function submitVote(p) {
  if (!p || !p.name) return { ok: false, error: '캐릭터명이 없습니다.' };

  var cfg = readConfig();
  var monday = upcomingMonday();
  var weekId = fmt(monday, 'yyyy-MM-dd');
  if (new Date() > deadlineOf(monday, cfg.마감시간)) {
    return { ok: false, error: '투표가 마감되었습니다.' };
  }

  var member = readMembers().filter(function (m) { return m.name === p.name; })[0];
  if (!member) return { ok: false, error: '명단에 없는 캐릭터입니다.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = ensureVotesSheet();
    var values = sh.getDataRange().getValues();
    var now = fmt(new Date(), 'yyyy-MM-dd HH:mm:ss');
    var row = [
      weekId,
      p.name,
      p.attend === '미참석' ? '미참석' : '참석',
      p.attend === '미참석' ? '' : (p.time || cfg.기본시간 || '21:00'),
      p.attend === '미참석' ? '' : (Number(p.power) || 0),
      now
    ];

    // (주차, 캐릭터명) 일치 행이 있으면 갱신(upsert)
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) === weekId && String(values[i][1]) === p.name) {
        sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
        return { ok: true };
      }
    }
    sh.appendRow(row);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ───────── 시트 읽기 ───────── */

function readMembers() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_MEMBERS);
  if (!sh) return [];
  var v = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var name = String(v[i][0] || '').trim();
    var cls = String(v[i][1] || '').trim();
    if (name) out.push({ name: name, cls: cls });
  }
  return out;
}

function readConfig() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CONFIG);
  var cfg = { 기본시간: '21:00', 마감시간: '21:00' };
  if (!sh) return cfg;
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    var key = String(v[i][0] || '').trim();
    if (key) cfg[key] = String(v[i][1] || '').trim();
  }
  return cfg;
}

function readVotes(weekId) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_VOTES);
  if (!sh) return [];
  var members = {};
  readMembers().forEach(function (m) { members[m.name] = m.cls; });
  var v = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) !== weekId) continue;
    var name = String(v[i][1] || '').trim();
    if (!name) continue;
    out.push({
      name: name,
      cls: members[name] || '',
      attend: String(v[i][2] || ''),
      time: String(v[i][3] || ''),
      power: Number(v[i][4]) || 0,
      updatedAt: String(v[i][5] || '')
    });
  }
  return out;
}

function ensureVotesSheet() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_VOTES);
  if (!sh) {
    sh = ss.insertSheet(SHEET_VOTES);
    sh.appendRow(['주차', '캐릭터명', '참석여부', '시간', '전투력', '업데이트시각']);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(['주차', '캐릭터명', '참석여부', '시간', '전투력', '업데이트시각']);
  }
  return sh;
}

/* ───────── 날짜 유틸 ───────── */

function upcomingMonday() {
  var now = new Date();
  var day = now.getDay();             // 0=일 ... 1=월
  var diff = (1 - day + 7) % 7;       // 월요일이면 0
  var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  return d;
}

function deadlineOf(monday, timeStr) {
  var parts = String(timeStr || '21:00').split(':');
  var d = new Date(monday);
  d.setHours(parseInt(parts[0], 10) || 21, parseInt(parts[1], 10) || 0, 0, 0);
  return d;
}

function fmt(d, pattern) {
  return Utilities.formatDate(d, TZ, pattern);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

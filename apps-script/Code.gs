/**
 * Code.gs — 리비 길드 레이드 스케줄러 (HtmlService 내장앱 버전)
 *
 * 이 버전은 사이트(HTML)를 Apps Script 가 직접 띄웁니다.
 * 정적 호스팅(GitHub Pages) 없이, 이 웹앱 URL(.../exec) 하나로 화면+데이터가 모두 동작합니다.
 * → 배포 액세스를 "Google 계정이 있는 모든 사용자"로 해도 정상 작동합니다
 *   (사이트가 google.script.run 으로 같은 도메인에서 호출하기 때문).
 *
 * ── 시트 구성 (탭 3개, 첫 행은 헤더) ──────────────────────────
 *  [길드원]  A:캐릭터명  B:클래스
 *  [설정]    A:키        B:값        (예: 기본시간 = 21:00 / 마감시간 = 21:00)
 *  [투표]    A:주차  B:캐릭터명  C:참석여부  D:시간  E:전투력  F:업데이트시각
 *            ※ [투표] 탭은 비어있어도 됩니다(스크립트가 헤더 자동 생성).
 *
 * ── 설치 ────────────────────────────────────────────────────
 *  1) 시트 메뉴 → 확장 프로그램 → Apps Script
 *  2) 아래 파일들을 그대로 만들기 (이름 정확히):
 *       - Code.gs        (이 파일)
 *       - index.html     (HTML 파일)
 *       - styles.html    (HTML 파일)
 *       - js.html        (HTML 파일)
 *     ※ HTML 파일 추가: 좌측 파일목록 + → HTML
 *  3) (권장) 프로젝트 설정 → 시간대 'Asia/Seoul'
 *  4) 배포 → 새 배포 → 유형:웹앱
 *       실행:나 / 액세스:"Google 계정이 있는 모든 사용자" → 배포 → 권한 승인
 *  5) 나온 웹앱 URL(.../exec)을 길드원에게 공유 (그 주소가 곧 사이트)
 */

var SHEET_MEMBERS = '길드원';
var SHEET_CONFIG  = '설정';
var SHEET_VOTES   = '투표';
var TZ = 'Asia/Seoul';

/* ───────── 화면 진입점 ───────── */

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('리비 길드 · 월요일 정기 콘텐츠')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** index.html 안에서 <?!= include('styles') ?> 로 다른 파일을 끼워넣기 위한 헬퍼 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ───────── 데이터 API (클라이언트에서 google.script.run 으로 호출) ───────── */

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
      if (asWeek(values[i][0]) === weekId && String(values[i][1]) === p.name) {
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
    // 시트가 "21:00" 을 시간값(Date)으로 자동변환해도 HH:mm 글자로 되돌림
    if (key) cfg[key] = asTime(v[i][1]);
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
    if (asWeek(v[i][0]) !== weekId) continue;   // 주차 칸이 Date로 변환돼도 맞춤
    var name = String(v[i][1] || '').trim();
    if (!name) continue;
    out.push({
      name: name,
      cls: members[name] || '',
      attend: String(v[i][2] || ''),
      time: asTime(v[i][3]),                     // 시간 칸이 Date로 변환돼도 HH:mm
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

/* 시트가 글자를 Date 로 자동변환해도 원래 형식으로 되돌리는 헬퍼 */
function asWeek(v) {
  if (v instanceof Date) return fmt(v, 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim();
}
function asTime(v) {
  if (v instanceof Date) return fmt(v, 'HH:mm');
  return String(v == null ? '' : v).trim();
}

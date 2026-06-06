/*
 * api.js — 백엔드 통신 계층
 *
 *  - CONFIG.APPS_SCRIPT_URL 이 설정돼 있으면  → 구글 시트(Apps Script) 사용
 *  - 비어 있으면                              → 데모 모드(localStorage)
 *
 * 공개 API
 *   Api.getData()            -> Promise<{ contentDate, deadline, isClosed, defaultTime, members, votes }>
 *   Api.submitVote(payload)  -> Promise<{ ok:true } | {ok:false, error}>
 *   Api.isDemo()             -> boolean
 */
(function () {
  'use strict';

  var URL = (window.CONFIG && window.CONFIG.APPS_SCRIPT_URL || '').trim();
  var DEMO = !URL;

  /* ---------- 공통 날짜 유틸 (데모 모드용 / 표시용) ---------- */

  // 한국시간(KST) 기준 '이번 주 월요일' (오늘이 월요일이면 오늘, 아니면 다가오는 월요일)
  function upcomingMonday(now) {
    now = now || new Date();
    var day = now.getDay();                 // 0=일 ... 1=월 ... 6=토
    var diff = (1 - day + 7) % 7;           // 다음 월요일까지 남은 일수 (월요일이면 0)
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
    return d;
  }

  function fmtDate(d) {
    var y = d.getFullYear();
    var mo = ('0' + (d.getMonth() + 1)).slice(-2);
    var da = ('0' + d.getDate()).slice(-2);
    return y + '-' + mo + '-' + da;
  }

  function deadlineOf(monday) {
    var t = (window.CONFIG.DEADLINE_TIME || '21:00').split(':');
    var d = new Date(monday);
    d.setHours(parseInt(t[0], 10), parseInt(t[1], 10), 0, 0);
    return d;
  }

  /* ---------- 데모 모드 (localStorage) ---------- */

  var LS_KEY = 'mabi_raid_votes_v1';

  function lsLoad() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function lsSave(obj) {
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
  }

  function demoGetData() {
    var monday = upcomingMonday();
    var weekId = fmtDate(monday);
    var deadline = deadlineOf(monday);
    var all = lsLoad();
    var votes = all[weekId] || [];
    return Promise.resolve({
      contentDate: weekId,
      deadline: deadline.toISOString(),
      isClosed: new Date() > deadline,
      defaultTime: window.CONFIG.DEFAULT_TIME,
      members: window.CONFIG.DEMO_MEMBERS.slice(),
      votes: votes
    });
  }

  function demoSubmit(payload) {
    var monday = upcomingMonday();
    var weekId = fmtDate(monday);
    if (new Date() > deadlineOf(monday)) {
      return Promise.resolve({ ok: false, error: '투표가 마감되었습니다.' });
    }
    var member = window.CONFIG.DEMO_MEMBERS.filter(function (m) {
      return m.name === payload.name;
    })[0];
    if (!member) {
      return Promise.resolve({ ok: false, error: '명단에 없는 캐릭터입니다.' });
    }
    var all = lsLoad();
    var votes = all[weekId] || [];
    votes = votes.filter(function (v) { return v.name !== payload.name; }); // upsert
    votes.push({
      name: payload.name,
      cls: member.cls,
      attend: payload.attend,
      time: payload.time,
      power: Number(payload.power) || 0,
      updatedAt: new Date().toISOString()
    });
    all[weekId] = votes;
    lsSave(all);
    return Promise.resolve({ ok: true });
  }

  /* ---------- 구글 시트 (Apps Script) ---------- */

  function sheetGetData() {
    return fetch(URL + '?action=getData', { method: 'GET' })
      .then(function (r) { return r.json(); });
  }

  function sheetSubmit(payload) {
    // text/plain 으로 보내 CORS preflight(OPTIONS)를 피함 → Apps Script 가 본문을 JSON 파싱
    return fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'vote', payload: payload })
    }).then(function (r) { return r.json(); });
  }

  /* ---------- 공개 ---------- */

  window.Api = {
    isDemo: function () { return DEMO; },
    getData: function () { return DEMO ? demoGetData() : sheetGetData(); },
    submitVote: function (payload) { return DEMO ? demoSubmit(payload) : sheetSubmit(payload); },
    // 유틸 노출 (app.js 표시용)
    upcomingMonday: upcomingMonday,
    fmtDate: fmtDate
  };
})();

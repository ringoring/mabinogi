/* app.js — UI 로직 */
(function () {
  'use strict';

  var state = {
    data: null,        // Api.getData() 결과
    tab: 'vote'        // 'vote' | 'party'
  };

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fmtKDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    var wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + wd + ')';
  }

  /* ---------- 데이터 ---------- */

  function load() {
    return Api.getData().then(function (d) {
      state.data = d;
      render();
    }).catch(function (e) {
      $('#app').innerHTML = '<div class="card error">데이터를 불러오지 못했습니다.<br><small>' +
        esc(e.message || e) + '</small></div>';
    });
  }

  /* 명단 + 투표 → 4분류 버킷 */
  function buckets() {
    var d = state.data;
    var defTime = d.defaultTime || '21:00';
    var voteByName = {};
    d.votes.forEach(function (v) { voteByName[v.name] = v; });

    var onTime = [], later = [], absent = [], noVote = [];
    d.members.forEach(function (m) {
      var v = voteByName[m.name];
      if (!v) { noVote.push(m); return; }
      var person = { name: m.name, cls: m.cls, power: Number(v.power) || 0, time: v.time };
      if (v.attend === '미참석') absent.push(person);
      else if (v.time === defTime) onTime.push(person);
      else later.push(person);
    });
    return { onTime: onTime, later: later, absent: absent, noVote: noVote };
  }

  /* ---------- 렌더 ---------- */

  function render() {
    var d = state.data;
    var deadline = new Date(d.deadline);
    var closed = d.isClosed;

    var html = '';
    html += headerHTML(d, deadline, closed);
    html += tabsHTML();
    html += '<div id="tab-body">' + (state.tab === 'vote' ? voteTabHTML(d, closed) : partyTabHTML()) + '</div>';
    $('#app').innerHTML = html;
    bind();
    if (state.tab === 'vote' && !closed) startCountdown(deadline);
  }

  function headerHTML(d, deadline, closed) {
    var demo = Api.isDemo()
      ? '<div class="demo-badge">데모 모드 · 구글 시트 미연동 (이 브라우저에만 저장됩니다)</div>'
      : '';
    return '' +
      demo +
      '<header class="hero">' +
      '  <div class="hero-guild">' + esc(CONFIG.GUILD_NAME) + '</div>' +
      '  <h1>' + esc(CONFIG.CONTENT_TITLE) + '</h1>' +
      '  <button class="banner" id="banner" ' + (closed ? 'disabled' : '') + '>' +
      '    <span class="banner-label">콘텐츠 날짜</span>' +
      '    <span class="banner-date">' + fmtKDate(d.contentDate) + '</span>' +
      '    <span class="banner-cta">' + (closed ? '🔒 투표 마감' : '신청하기 / 투표 ▸') + '</span>' +
      '  </button>' +
      '  <div class="deadline" id="deadline-line">' +
         (closed ? '투표가 마감되었습니다.' : '마감: ' + deadline.toLocaleString('ko-KR')) +
      '  </div>' +
      '</header>';
  }

  function tabsHTML() {
    return '' +
      '<nav class="tabs">' +
      '  <button class="tab ' + (state.tab === 'vote' ? 'active' : '') + '" data-tab="vote">신청 / 투표</button>' +
      '  <button class="tab ' + (state.tab === 'party' ? 'active' : '') + '" data-tab="party">파티 분배</button>' +
      '</nav>';
  }

  /* ----- 투표 탭 ----- */

  function voteTabHTML(d, closed) {
    var b = buckets();
    var total = d.members.length;
    var voted = total - b.noVote.length;

    var summary = '' +
      '<div class="card">' +
      '  <div class="summary">' +
      '    <div class="stat"><b>' + voted + '</b><span>투표</span></div>' +
      '    <div class="stat"><b>' + total + '</b><span>전체</span></div>' +
      '    <div class="stat on"><b>' + b.onTime.length + '</b><span>9시 참석</span></div>' +
      '    <div class="stat later"><b>' + b.later.length + '</b><span>9시 이후</span></div>' +
      '    <div class="stat off"><b>' + b.absent.length + '</b><span>미참석</span></div>' +
      '    <div class="stat none"><b>' + b.noVote.length + '</b><span>미투표</span></div>' +
      '  </div>' +
      '</div>';

    var cta = closed
      ? '<div class="card muted">투표가 마감되어 더 이상 신청할 수 없습니다. “파티 분배” 탭에서 결과를 확인하세요.</div>'
      : '<div class="card"><button class="primary big" id="open-vote">＋ 내 캐릭터로 신청 / 투표</button></div>';

    return summary + cta + recentVotesHTML(d);
  }

  function recentVotesHTML(d) {
    if (!d.votes.length) return '';
    var rows = d.votes.slice().sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    }).map(function (v) {
      var badge = v.attend === '미참석'
        ? '<span class="pill off">미참석</span>'
        : '<span class="pill on">' + esc(v.time) + '</span>';
      return '<tr><td>' + esc(v.name) + '</td><td><span class="cls ' + Party.categoryOf(v.cls) + '">' +
        esc(v.cls) + '</span></td><td>' + badge + '</td><td class="num">' +
        (v.attend === '미참석' ? '-' : esc(String(v.power))) + '</td></tr>';
    }).join('');
    return '<div class="card"><h3>현재 투표 현황</h3>' +
      '<table class="tbl"><thead><tr><th>캐릭터</th><th>클래스</th><th>참석</th><th>전투력</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  /* ----- 파티 탭 ----- */

  function partyTabHTML() {
    var b = buckets();
    var html = '';

    html += '<div class="card"><h3>9시 정시 파티 <small>(' + b.onTime.length + '명)</small></h3>' +
      partiesHTML(Party.buildParties(b.onTime, CONFIG.PARTY_SIZE)) + '</div>';

    if (b.later.length) {
      html += '<div class="card"><h3>9시 이후 파티 <small>(' + b.later.length + '명)</small></h3>' +
        partiesHTML(Party.buildParties(b.later, CONFIG.PARTY_SIZE)) + '</div>';
    }

    html += '<div class="card cols">' +
      listColHTML('미참석', b.absent, 'off') +
      listColHTML('미투표', b.noVote, 'none') +
      '</div>';

    return html;
  }

  function partiesHTML(parties) {
    if (!parties.length) return '<p class="muted">아직 인원이 없습니다.</p>';
    return '<div class="parties">' + parties.map(function (p, i) {
      var members = p.members.map(function (m) {
        return '<li><span class="dot ' + m.cat + '"></span>' +
          '<span class="pname">' + esc(m.name) + '</span>' +
          '<span class="cls ' + m.cat + '">' + esc(m.cls) + '</span>' +
          '<span class="pw">' + esc(String(m.power)) + '</span></li>';
      }).join('');
      var hasTank = p.members.some(function (m) { return m.cat === 'tank'; });
      var hasHeal = p.members.some(function (m) { return m.cat === 'heal'; });
      var warn = (!hasTank || !hasHeal)
        ? '<span class="warn">' + (!hasTank ? '탱 없음 ' : '') + (!hasHeal ? '힐 없음' : '') + '</span>'
        : '';
      return '<div class="party">' +
        '<div class="party-head">' + (i + 1) + '파티 ' + warn +
        '<span class="ptotal">전투력 ' + p.total.toLocaleString() + '</span></div>' +
        '<ul class="party-list">' + members + '</ul></div>';
    }).join('') + '</div>';
  }

  function listColHTML(title, arr, kind) {
    var items = arr.length
      ? arr.map(function (m) {
          return '<li><span class="pname">' + esc(m.name) + '</span><span class="cls ' +
            Party.categoryOf(m.cls) + '">' + esc(m.cls) + '</span></li>';
        }).join('')
      : '<li class="muted">없음</li>';
    return '<div class="col"><h4 class="' + kind + '">' + title + ' <small>(' + arr.length + ')</small></h4>' +
      '<ul class="plain">' + items + '</ul></div>';
  }

  /* ---------- 투표 모달 ---------- */

  function openModal() {
    var d = state.data;
    var opts = timeOptions(d.defaultTime);
    var memberOpts = d.members.map(function (m) {
      return '<option value="' + esc(m.name) + '">';
    }).join('');

    var modal = document.createElement('div');
    modal.className = 'modal-bg';
    modal.innerHTML = '' +
      '<div class="modal">' +
      '  <button class="modal-x" id="modal-x">✕</button>' +
      '  <h2>신청 / 투표</h2>' +
      '  <p class="muted small">' + esc(CONFIG.GUILD_NAME) + ' 길드원만 신청 가능합니다.</p>' +
      '  <label>캐릭터명' +
      '    <input id="f-name" list="members" autocomplete="off" placeholder="명단의 캐릭터명 입력">' +
      '    <datalist id="members">' + memberOpts + '</datalist>' +
      '  </label>' +
      '  <div id="f-class" class="class-hint"></div>' +
      '  <div class="attend-toggle">' +
      '    <button type="button" class="att active" data-att="참석">참석</button>' +
      '    <button type="button" class="att" data-att="미참석">미참석</button>' +
      '  </div>' +
      '  <div id="attend-fields">' +
      '    <label>참여 시간' +
      '      <select id="f-time">' + opts + '</select>' +
      '    </label>' +
      '    <label>전투력 <span class="muted small">(근사치 허용)</span>' +
      '      <input id="f-power" type="number" inputmode="numeric" min="0" placeholder="예: 35000">' +
      '    </label>' +
      '  </div>' +
      '  <div class="modal-err" id="modal-err"></div>' +
      '  <button class="primary big" id="f-submit">투표하기</button>' +
      '</div>';
    document.body.appendChild(modal);

    var attend = '참석';
    var nameEl = $('#f-name', modal);

    function refreshClass() {
      var m = d.members.filter(function (x) { return x.name === nameEl.value.trim(); })[0];
      $('#f-class', modal).innerHTML = m
        ? '<span class="cls ' + Party.categoryOf(m.cls) + '">' + esc(m.cls) + '</span> 으로 신청'
        : (nameEl.value ? '<span class="warn">명단에 없는 캐릭터입니다</span>' : '');
    }
    nameEl.addEventListener('input', refreshClass);

    $$('.att', modal).forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.att', modal).forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        attend = btn.getAttribute('data-att');
        $('#attend-fields', modal).style.display = (attend === '참석') ? '' : 'none';
      });
    });

    function close() { document.body.removeChild(modal); }
    $('#modal-x', modal).addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

    $('#f-submit', modal).addEventListener('click', function () {
      var name = nameEl.value.trim();
      var err = $('#modal-err', modal);
      err.textContent = '';
      var member = d.members.filter(function (x) { return x.name === name; })[0];
      if (!member) { err.textContent = '명단에 있는 캐릭터명을 입력해주세요.'; return; }
      var power = 0;
      if (attend === '참석') {
        power = parseInt($('#f-power', modal).value, 10);
        if (!power || power <= 0) { err.textContent = '전투력을 입력해주세요.'; return; }
      }
      var payload = {
        name: name,
        attend: attend,
        time: attend === '참석' ? $('#f-time', modal).value : '',
        power: power
      };
      var sub = $('#f-submit', modal);
      sub.disabled = true; sub.textContent = '전송 중...';
      Api.submitVote(payload).then(function (res) {
        if (res && res.ok) { close(); load(); }
        else { err.textContent = (res && res.error) || '저장에 실패했습니다.'; sub.disabled = false; sub.textContent = '투표하기'; }
      }).catch(function (e) {
        err.textContent = '오류: ' + (e.message || e); sub.disabled = false; sub.textContent = '투표하기';
      });
    });
  }

  function timeOptions(def) {
    var times = [];
    for (var h = 21; h <= 23; h++) {
      times.push(('0' + h).slice(-2) + ':00');
      times.push(('0' + h).slice(-2) + ':30');
    }
    return times.map(function (t) {
      var label = (t === def) ? t + ' (정시)' : t;
      return '<option value="' + t + '"' + (t === def ? ' selected' : '') + '>' + label + '</option>';
    }).join('');
  }

  /* ---------- 카운트다운 ---------- */

  var countdownTimer = null;
  function startCountdown(deadline) {
    if (countdownTimer) clearInterval(countdownTimer);
    function tick() {
      var line = $('#deadline-line');
      if (!line) { clearInterval(countdownTimer); return; }
      var ms = deadline - new Date();
      if (ms <= 0) { clearInterval(countdownTimer); load(); return; }
      var h = Math.floor(ms / 3600000);
      var m = Math.floor((ms % 3600000) / 60000);
      var s = Math.floor((ms % 60000) / 1000);
      line.innerHTML = '마감까지 <b>' + h + '시간 ' + m + '분 ' + s + '초</b> · ' + deadline.toLocaleString('ko-KR');
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  /* ---------- 이벤트 바인딩 ---------- */

  function bind() {
    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        state.tab = t.getAttribute('data-tab');
        render();
      });
    });
    var banner = $('#banner');
    if (banner) banner.addEventListener('click', function () { if (!state.data.isClosed) openModal(); });
    var ov = $('#open-vote');
    if (ov) ov.addEventListener('click', openModal);
  }

  /* ---------- 시작 ---------- */
  load();
})();

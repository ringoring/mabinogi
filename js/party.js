/*
 * party.js — 자동 파티 분배 로직 (순수 함수, 브라우저/Node 양쪽에서 사용 가능)
 *
 * 규칙 (리비 길드 요구사항)
 *  - 파티 인원 4인
 *  - 4명으로 딱 떨어지지 않으면, 꽉 찬 파티를 우선 만들고 남는 인원은 "대기파티"로 분리
 *  - 파티당 탱커 1, 힐러 1 우선 분배
 *      · 없으면 둘 중 한 계열이라도 들어가도록
 *      · 모자라면 탱/힐이 골고루 "분산"되도록 (한 파티에 몰리지 않게)
 *  - 그 위에서 파티별 전투력 합이 비슷하도록 균형 분배
 *
 *  계열 구분
 *    탱커: 전사, 빙결술사, 기사
 *    힐러: 힐러, 사제, 음유시인, 수도사
 *    딜러: 그 외 전부
 *
 *  반환: { parties: [{members, total}, ...], waiting: [member, ...] }
 */
(function (root) {
  'use strict';

  var TANK_CLASSES = ['전사', '빙결술사', '기사'];
  var HEAL_CLASSES = ['힐러', '사제', '음유시인', '수도사'];

  function categoryOf(cls) {
    if (TANK_CLASSES.indexOf(cls) !== -1) return 'tank';
    if (HEAL_CLASSES.indexOf(cls) !== -1) return 'heal';
    return 'dealer';
  }

  function byPowerDesc(a, b) {
    return (b.power || 0) - (a.power || 0);
  }

  /**
   * 파티 자동 구성
   * @param {Array<{name:string, cls:string, power:number}>} members
   * @param {number} [partySize=4]
   * @returns {{parties: Array<{members:Array, total:number}>, waiting: Array}}
   */
  function buildParties(members, partySize) {
    partySize = partySize || 4;

    var list = (members || []).map(function (m) {
      return {
        name: m.name,
        cls: m.cls,
        cat: categoryOf(m.cls),
        power: Number(m.power) || 0
      };
    });

    var n = list.length;
    if (n === 0) return { parties: [], waiting: [] };

    // 4명 꽉 찬 파티를 우선. 딱 안 떨어지면 나머지는 대기파티로.
    // (4명 미만이면 파티 1개만 만들어 전원 배치)
    var numParties = Math.floor(n / partySize) || 1;

    var parties = [];
    for (var i = 0; i < numParties; i++) parties.push({ members: [], total: 0 });

    var tanks = list.filter(function (m) { return m.cat === 'tank'; }).sort(byPowerDesc);
    var heals = list.filter(function (m) { return m.cat === 'heal'; }).sort(byPowerDesc);
    var dealers = list.filter(function (m) { return m.cat === 'dealer'; }).sort(byPowerDesc);

    function add(p, m) { p.members.push(m); p.total += m.power; }
    function hasCat(p, cat) { return p.members.some(function (m) { return m.cat === cat; }); }
    function hasSupport(p) { return hasCat(p, 'tank') || hasCat(p, 'heal'); }

    // 조건을 만족하면서 자리가 남은 파티 중 전투력 합이 가장 낮은 곳을 고름 (없으면 -1)
    function pick(ok) {
      var best = -1;
      for (var i = 0; i < numParties; i++) {
        var p = parties[i];
        if (p.members.length < partySize && ok(p)) {
          if (best === -1 || p.total < parties[best].total) best = i;
        }
      }
      return best;
    }

    var waiting = [];

    // 1) 각 파티에 탱커 1명씩 (전투력 낮은 파티 우선 → 균형)
    var ti = 0;
    for (; ti < tanks.length; ti++) {
      var t = pick(function (p) { return !hasCat(p, 'tank'); });
      if (t === -1) break;
      add(parties[t], tanks[ti]);
    }

    // 2) 힐러: (a) 지원 전혀 없는 파티부터 → (b) 힐 없는 파티 (둘 다 전투력 낮은 곳 우선)
    var hi = 0;
    for (; hi < heals.length; hi++) {
      var h1 = pick(function (p) { return !hasSupport(p); });
      if (h1 === -1) break;
      add(parties[h1], heals[hi]);
    }
    for (; hi < heals.length; hi++) {
      var h2 = pick(function (p) { return !hasCat(p, 'heal'); });
      if (h2 === -1) break;
      add(parties[h2], heals[hi]);
    }

    // 3) 남은 인원(잉여 탱/힐 + 딜러)을 전투력 균형 그리디로, 자리 없으면 대기파티로
    var pool = tanks.slice(ti).concat(heals.slice(hi)).concat(dealers).sort(byPowerDesc);
    for (var k = 0; k < pool.length; k++) {
      var idx = pick(function () { return true; });
      if (idx === -1) waiting.push(pool[k]);
      else add(parties[idx], pool[k]);
    }

    waiting.sort(byPowerDesc);
    return { parties: parties, waiting: waiting };
  }

  var api = {
    TANK_CLASSES: TANK_CLASSES,
    HEAL_CLASSES: HEAL_CLASSES,
    categoryOf: categoryOf,
    buildParties: buildParties
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;       // Node (테스트)
  } else {
    root.Party = api;           // 브라우저 (window.Party)
  }
})(typeof self !== 'undefined' ? self : this);

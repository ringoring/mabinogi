/*
 * party.js — 자동 파티 분배 로직 (순수 함수, 브라우저/Node 양쪽에서 사용 가능)
 *
 * 규칙 (리비 길드 요구사항)
 *  - 파티 인원 4인
 *  - 파티당 탱커 1, 힐러 1 우선 분배
 *      · 없으면 둘 중 한 계열이라도 들어가도록
 *      · 모자라면 탱/힐이 골고루 "분산"되도록 (한 파티에 몰리지 않게)
 *  - 그 위에서 파티별 전투력 합이 비슷하도록 균형 분배
 *
 *  계열 구분
 *    탱커: 전사, 빙결술사, 기사
 *    힐러: 힐러, 사제, 음유시인, 수도사
 *    딜러: 그 외 전부
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
   * 4인 파티 자동 구성
   * @param {Array<{name:string, cls:string, power:number}>} members
   * @param {number} [partySize=4]
   * @returns {Array<{members:Array, total:number}>}
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
    if (n === 0) return [];

    var numParties = Math.ceil(n / partySize);
    var parties = [];
    for (var i = 0; i < numParties; i++) parties.push({ members: [], total: 0 });

    var tanks = list.filter(function (m) { return m.cat === 'tank'; }).sort(byPowerDesc);
    var heals = list.filter(function (m) { return m.cat === 'heal'; }).sort(byPowerDesc);
    var dealers = list.filter(function (m) { return m.cat === 'dealer'; }).sort(byPowerDesc);

    function add(p, m) {
      p.members.push(m);
      p.total += m.power;
    }
    function hasSupport(p) {
      return p.members.some(function (m) { return m.cat === 'tank' || m.cat === 'heal'; });
    }
    function hasCat(p, cat) {
      return p.members.some(function (m) { return m.cat === cat; });
    }

    // 1) 각 파티에 탱커 1명씩 골고루 (전투력 높은 순) — 한 파티에 몰리지 않도록 분산
    var ti = 0;
    for (var p1 = 0; p1 < numParties && ti < tanks.length; p1++) {
      add(parties[p1], tanks[ti++]);
    }

    // 2) 힐러 분배 — (a) 지원(탱/힐) 없는 파티부터 채워 "최소 한 계열은 보장"
    var hi = 0;
    for (var p2 = 0; p2 < numParties && hi < heals.length; p2++) {
      if (!hasSupport(parties[p2])) add(parties[p2], heals[hi++]);
    }
    // 2-b) 남은 힐러는 탱커만 있고 힐러 없는 파티에 → 탱+힐 조합 완성
    for (var p3 = 0; p3 < numParties && hi < heals.length; p3++) {
      if (!hasCat(parties[p3], 'heal') && parties[p3].members.length < partySize) {
        add(parties[p3], heals[hi++]);
      }
    }

    // 3) 남은 인원(잉여 탱/힐 + 딜러 전부)을 전투력 내림차순 풀로
    var pool = tanks.slice(ti).concat(heals.slice(hi)).concat(dealers).sort(byPowerDesc);

    // 4) 그리디 전투력 균형: 빈 자리 있는 파티 중 전투력 합이 가장 낮은 곳에 배치
    for (var k = 0; k < pool.length; k++) {
      var best = -1;
      for (var pp = 0; pp < numParties; pp++) {
        if (parties[pp].members.length < partySize) {
          if (best === -1 || parties[pp].total < parties[best].total) best = pp;
        }
      }
      if (best === -1) break;
      add(parties[best], pool[k]);
    }

    return parties;
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

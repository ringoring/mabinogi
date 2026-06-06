/* 파티 분배 로직 테스트 — 실행: npm test  (또는 node tests/party.test.js) */
var Party = require('../js/party.js');
var assert = require('assert');

var passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    console.error('  ✗ ' + name + '\n    ' + e.message);
    process.exitCode = 1;
  }
}

function m(name, cls, power) { return { name: name, cls: cls, power: power }; }

console.log('파티 분배 테스트');

test('계열 구분이 올바르다', function () {
  assert.strictEqual(Party.categoryOf('전사'), 'tank');
  assert.strictEqual(Party.categoryOf('빙결술사'), 'tank');
  assert.strictEqual(Party.categoryOf('기사'), 'tank');
  assert.strictEqual(Party.categoryOf('힐러'), 'heal');
  assert.strictEqual(Party.categoryOf('음유시인'), 'heal');
  assert.strictEqual(Party.categoryOf('수도사'), 'heal');
  assert.strictEqual(Party.categoryOf('대검전사'), 'dealer');
  assert.strictEqual(Party.categoryOf('궁수'), 'dealer');
});

test('빈 입력은 빈 결과', function () {
  assert.deepStrictEqual(Party.buildParties([]), { parties: [], waiting: [] });
});

test('8명 → 정확히 2파티, 모두 4명, 대기 0', function () {
  var people = [
    m('탱1', '전사', 100), m('탱2', '기사', 90),
    m('힐1', '힐러', 80), m('힐2', '사제', 70),
    m('딜1', '궁수', 120), m('딜2', '도적', 110),
    m('딜3', '마법사', 60), m('딜4', '격투가', 50)
  ];
  var r = Party.buildParties(people);
  assert.strictEqual(r.parties.length, 2);
  r.parties.forEach(function (p) { assert.strictEqual(p.members.length, 4); });
  assert.strictEqual(r.waiting.length, 0);
});

test('탱2 힐2 → 각 파티에 탱1 힐1씩 분배', function () {
  var people = [
    m('탱1', '전사', 100), m('탱2', '기사', 90),
    m('힐1', '힐러', 80), m('힐2', '사제', 70),
    m('딜1', '궁수', 120), m('딜2', '도적', 110),
    m('딜3', '마법사', 60), m('딜4', '격투가', 50)
  ];
  var r = Party.buildParties(people);
  r.parties.forEach(function (p) {
    var tanks = p.members.filter(function (x) { return x.cat === 'tank'; }).length;
    var heals = p.members.filter(function (x) { return x.cat === 'heal'; }).length;
    assert.strictEqual(tanks, 1, '파티당 탱커 1명');
    assert.strictEqual(heals, 1, '파티당 힐러 1명');
  });
});

test('탱2 힐0 (12명·3파티) → 탱커가 서로 다른 파티로 분산', function () {
  var people = [
    m('탱1', '전사', 100), m('탱2', '기사', 95)
  ];
  for (var i = 0; i < 10; i++) people.push(m('딜' + i, '궁수', 50 + i));
  var r = Party.buildParties(people);
  assert.strictEqual(r.parties.length, 3);
  var partiesWithTank = r.parties.filter(function (p) {
    return p.members.some(function (x) { return x.cat === 'tank'; });
  });
  assert.strictEqual(partiesWithTank.length, 2, '탱커 2명이 서로 다른 파티에');
});

test('지원(탱/힐) 부족 시 최대한 많은 파티가 최소 1명의 지원 보유', function () {
  var people = [m('탱1', '전사', 100), m('힐1', '힐러', 90)];
  for (var i = 0; i < 10; i++) people.push(m('딜' + i, '도적', 40 + i));
  var r = Party.buildParties(people);
  var supported = r.parties.filter(function (p) {
    return p.members.some(function (x) { return x.cat !== 'dealer'; });
  });
  assert.strictEqual(supported.length, 2, '탱/힐이 서로 다른 파티에 분산');
});

test('전투력 균형: 파티 간 합계 차이가 과도하지 않다', function () {
  var people = [];
  var classes = ['전사', '힐러', '궁수', '도적', '마법사', '기사', '사제', '격투가'];
  for (var i = 0; i < 16; i++) {
    people.push(m('p' + i, classes[i % classes.length], 100 + (i * 7) % 50));
  }
  var r = Party.buildParties(people);
  var totals = r.parties.map(function (p) { return p.total; });
  var max = Math.max.apply(null, totals);
  var min = Math.min.apply(null, totals);
  assert.ok(max - min <= 150, '파티 간 전투력 차 ' + (max - min) + ' 가 과도함');
});

test('4명으로 안 떨어지면 꽉 찬 파티 우선 + 나머지는 대기파티', function () {
  // 13명 → 4명짜리 3파티 + 대기 1명
  var people = [
    m('탱1', '전사', 100), m('탱2', '기사', 95), m('탱3', '빙결술사', 90),
    m('힐1', '힐러', 85)
  ];
  for (var i = 0; i < 9; i++) people.push(m('딜' + i, '궁수', 50 + i));
  var r = Party.buildParties(people);
  assert.strictEqual(r.parties.length, 3, '4명짜리 파티 3개');
  r.parties.forEach(function (p) { assert.strictEqual(p.members.length, 4); });
  assert.strictEqual(r.waiting.length, 1, '대기 1명');
  // 인원 보존
  var inParties = r.parties.reduce(function (a, p) { return a + p.members.length; }, 0);
  assert.strictEqual(inParties + r.waiting.length, 13, '인원 보존');
});

test('홀수 인원(6명) → 4명 1파티 + 대기 2명', function () {
  var people = [
    m('탱1', '전사', 100), m('힐1', '힐러', 90),
    m('딜1', '궁수', 80), m('딜2', '도적', 70),
    m('딜3', '마법사', 60), m('딜4', '격투가', 50)
  ];
  var r = Party.buildParties(people);
  assert.strictEqual(r.parties.length, 1);
  assert.strictEqual(r.parties[0].members.length, 4);
  assert.strictEqual(r.waiting.length, 2);
  var count = r.parties[0].members.length + r.waiting.length;
  assert.strictEqual(count, 6, '인원 보존');
});

test('4명 미만(3명) → 1파티에 전원, 대기 0', function () {
  var people = [m('탱1', '전사', 100), m('힐1', '힐러', 90), m('딜1', '궁수', 80)];
  var r = Party.buildParties(people);
  assert.strictEqual(r.parties.length, 1);
  assert.strictEqual(r.parties[0].members.length, 3);
  assert.strictEqual(r.waiting.length, 0);
});

console.log('\n통과: ' + passed + '개');

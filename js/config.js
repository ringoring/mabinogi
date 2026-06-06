/*
 * config.js — 사이트 설정
 *
 * ▶ 구글 시트와 연동하려면 아래 APPS_SCRIPT_URL 에
 *   배포한 Apps Script 웹앱 URL( .../exec )을 붙여넣으세요.
 *   (설정 방법은 README.md 참고)
 *
 * ▶ 비워두면 "데모 모드"로 동작합니다 (브라우저 localStorage 저장 — 본인 화면에서만 보임).
 */
window.CONFIG = {
  // 예) 'https://script.google.com/macros/s/AKfycb..../exec'
  APPS_SCRIPT_URL: '',

  // 길드 이름 / 콘텐츠 제목 (화면 표시용)
  GUILD_NAME: '리비 길드',
  CONTENT_TITLE: '월요일 정기 콘텐츠',

  // 정시 기준 시간 (이 시간에 참석 = "9시 참석", 이보다 늦으면 "9시 이후")
  DEFAULT_TIME: '21:00',

  // 자동 마감 시각 (해당 주 월요일의 이 시각이 지나면 투표 마감)
  DEADLINE_TIME: '21:00',

  // 파티 인원
  PARTY_SIZE: 4,

  // 데모 모드에서 보여줄 샘플 길드원 명단 (시트 연동 시 무시됨)
  DEMO_MEMBERS: [
    { name: '아르베드', cls: '전사' },
    { name: '나오', cls: '기사' },
    { name: '루에리', cls: '빙결술사' },
    { name: '티르코네일', cls: '힐러' },
    { name: '던바튼', cls: '사제' },
    { name: '콜헨', cls: '음유시인' },
    { name: '이멘마하', cls: '수도사' },
    { name: '에린', cls: '궁수' },
    { name: '모리안', cls: '도적' },
    { name: '키홀', cls: '마법사' },
    { name: '크롬바스', cls: '격투가' },
    { name: '셰익스피어', cls: '대검전사' }
  ]
};

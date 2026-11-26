/**
 * 모든 화면 훑어보기 시험. (build-preview.js --selftest=screens --xss=1) 화면 폭을 바꿔(run-selftest.ps1 -Width) 여러 번 돌린다.
 * 확인: 화면마다 (1) "undefined/NaN/[object" 같은 깨진 글자가 없다 (2) 주민번호 모양의 값이 없다 (3) 스크립트가 실행되지 않았다
 *       (4) 표 영역(.scroll)을 빼고는 화면 폭을 넘치는 요소가 없다 (모바일 폭 포함)
 */
(function () {
  var out = [], fails = 0;
  function ok(name, cond, extra) { if (!cond) fails++; out.push((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra === undefined ? '' : '  → ' + extra)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function waitFor(fn, label, ms) {
    var t0 = Date.now();
    return new Promise(function (res, rej) {
      (function tick() { var v; try { v = fn(); } catch (e) { v = false; } if (v) return res(v); if (Date.now() - t0 > (ms || 6000)) return rej(new Error('시간 초과: ' + label)); setTimeout(tick, 50); })();
    });
  }
  var RRN_RE = /(?<!\d)\d{6}\s*-?\s*[1-8]\d{6}(?!\d)/;
  function leaks() {
    var clone = document.body.cloneNode(true);
    [].slice.call(clone.querySelectorAll('script')).forEach(function (s) { s.parentNode.removeChild(s); });
    var rep = clone.querySelector('#__report'); if (rep) rep.parentNode.removeChild(rep);
    return RRN_RE.test(clone.outerHTML) || RRN_RE.test(clone.textContent);
  }
  function broken() {
    var t = (document.querySelector('main') || document.body).innerText;
    var m = /undefined|NaN|\[object|\bnull\b/.exec(t);
    return m ? m[0] + ' … ' + t.slice(Math.max(0, m.index - 20), m.index + 30).replace(/\s+/g, ' ') : '';
  }
  /** 표 영역(.scroll)과 가려진 패널 밖에서 화면 폭을 넘치는 요소 */
  function overflowing() {
    var W = document.documentElement.clientWidth, bad = [];
    [].slice.call(document.querySelectorAll('main *, .side *, .panel *, .modal *')).forEach(function (el) {
      if (bad.length >= 3) return;
      var r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= W + 1) return;
      for (var p = el.parentElement; p; p = p.parentElement) { if (p.classList && (p.classList.contains('scroll') || p.classList.contains('rcpt'))) return; if (p === document.body) break; }
      var st = getComputedStyle(el);
      if (st.position === 'fixed') return;
      bad.push(el.tagName.toLowerCase() + '.' + (el.className || '') + ' right=' + Math.round(r.right));
    });
    return { w: W, bad: bad, doc: document.documentElement.scrollWidth };
  }

  function check(label) {
    var b = broken(), o = overflowing();
    ok(label + ': 깨진 글자 없음', !b, b);
    ok(label + ': 주민번호 모양의 값 없음', !leaks());
    ok(label + ': 스크립트 실행 없음', !window.__XSS);
    ok(label + ': 화면 폭(' + o.w + 'px)을 넘치는 요소 없음 (표 영역 제외)', o.bad.length === 0 && o.doc <= o.w + 1, o.bad.join(' | ') + ' doc=' + o.doc);
  }

  function run() {
    var steps = [
      ['홈 대시보드', function () { S.screen = 'dash'; }],
      ['회차 상세', function () { S.sid = 'w6'; S.screen = 'sess'; }],
      ['참여자', function () { S.screen = 'people'; }],
      ['회차 관리', function () { S.screen = 'sessions'; }],
      ['신청 엑셀 업로드', function () { S.screen = 'apply'; }],
      ['문자·메일 발송 준비', function () { sendInit('w6', 'pay'); S.screen = 'send'; }],
      ['기존 엑셀 이관', function () { S.screen = 'imp'; }],
      ['운영진 관리', function () { S.screen = 'staff'; loadStaff(); }],
      ['시스템 상태', function () { S.screen = 'status'; }]
    ];
    var chain = Promise.resolve();
    out.push('화면 폭 ' + document.documentElement.clientWidth + 'px');
    steps.forEach(function (st) {
      chain = chain.then(function () { st[1](); render(); return sleep(250); }).then(function () { check(st[0]); });
    });
    chain = chain.then(function () {
      S.screen = 'sess'; S.sid = 'w6'; S.drawer = { eid: S.boot.enrollments[0].enroll_id }; S.edit = false; render(); return sleep(150);
    }).then(function () { check('참여자 상세 패널'); S.edit = true; render(); return sleep(150); })
      .then(function () { check('참여자 수정 패널'); S.drawer = null; S.edit = false; S.sf = { mode: 'new', prog: '' }; render(); return sleep(150); })
      .then(function () { check('회차 입력 패널'); S.sf = null; render(); insOpen('w6'); return waitFor(function () { return S.ins && S.ins.data; }, '명단'); })
      .then(function () { return sleep(150); })
      .then(function () { check('보험사 명단 창'); insClose(); openModal({ title: '확인 창', html: '<p>내용</p>', yes: '확인' }, function () {}); return sleep(100); })
      .then(function () { check('확인 창'); closeModal(); })
      .catch(function (e) { ok('시험 도중 오류 없이 끝난다', false, e && e.message); })
      .then(function () {
        var box = document.createElement('pre'); box.id = '__report';
        box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:40vh;overflow:auto;margin:0;padding:12px 16px;background:' + (fails ? '#b4390c' : '#17803d') + ';color:#fff;font:12px/1.5 monospace;z-index:99;white-space:pre-wrap';
        box.textContent = (fails ? '실패 ' + fails + '개\n' : '모두 통과 (' + out.length + '개)\n') + out.join('\n');
        document.body.appendChild(box);
        document.title = 'SELFTEST ' + (fails ? 'FAIL ' + fails : 'PASS ' + out.length);
      });
  }
  setTimeout(function () { waitFor(function () { return window.S && S.boot && typeof statusHtml === 'function'; }, '앱 준비').then(run).catch(function (e) { document.title = 'SELFTEST ERROR ' + e.message; }); }, 300);
})();

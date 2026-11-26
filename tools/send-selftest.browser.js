/**
 * 문자·메일 발송 준비 화면의 브라우저 자동 시험. (build-preview.js --selftest=send 로 만든 미리보기에서 실행)
 * 대상 계산, 문구 채우기, 복사(막혔을 때 대체 창 포함), 문구 저장·불러오기·삭제, 발송 기록과 안내 완료 표시, 스크립트 삽입을 확인한다.
 */
(function () {
  var out = [], fails = 0;
  function ok(name, cond, extra) { if (!cond) fails++; out.push((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra === undefined ? '' : '  → ' + extra)); }
  function waitFor(fn, label, ms) {
    var t0 = Date.now();
    return new Promise(function (res, rej) {
      (function tick() { var v; try { v = fn(); } catch (e) { v = false; } if (v) return res(v); if (Date.now() - t0 > (ms || 6000)) return rej(new Error('시간 초과: ' + label)); setTimeout(tick, 50); })();
    });
  }
  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }
  function click(sel) { var el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) throw new Error('버튼 없음: ' + sel); el.click(); }
  function text() { return document.body.innerText; }
  function setVal(id, v, evt) { var el = document.getElementById(id); el.value = v; fire(el, evt || 'input'); return el; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function run() {
    var copied = [], failCopy = false;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: function (t) { if (failCopy) return Promise.reject(new Error('막힘')); copied.push(t); return Promise.resolve(); } } });
    // 홈 대시보드의 할 일 패널 (G-5)
    S.screen = 'dash'; render();
    var tt = text();
    ok('할 일 패널: 주민번호 없음·확인 필요 2명 / 보험 미가입 3명 / 입금 미확인 2명이 보인다', /주민번호 없음·확인 필요 2명/.test(tt) && /여행자보험 미가입 3명/.test(tt) && /참가비 입금 미확인 2명/.test(tt), tt.slice(tt.indexOf('할 일'), tt.indexOf('할 일') + 300));
    ok('할 일 패널: 보험 가입을 마친 사람(번호가 지워진 사람)은 주민번호 항목에 세지 않는다', !/주민번호 없음·확인 필요 [345]명/.test(tt));
    var urgent = urgentTodoCount(S.boot), bd = document.querySelector('.nav .bd');
    ok('사이드바의 홈 대시보드에 긴급 개수 배지가 있다', urgent >= 1 && !!bd && bd.textContent === String(urgent), urgent + '/' + (bd && bd.textContent));
    ok('긴급 항목이 목록 맨 위에 온다 (주민번호)', /주민번호 없음/.test(document.querySelector('.todo b').textContent));
    click('.todo [data-act="send-open"][data-stage="pay"]');
    ok('"입금 요청 문자" 버튼이 발송 준비 화면을 입금 요청 단계로 연다', S.screen === 'send' && S.send.stage === 'pay' && S.send.sid === 'w6' && S.send.filter === 'unpaid');
    S.screen = 'dash'; render();
    click('.todo [data-act="ins-open"]');
    ok('"보험사 명단" 버튼이 명단 창을 연다', !!S.ins && S.ins.sid === 'w6');
    insClose();
    sendInit('w6'); S.screen = 'send'; render();
    ok('발송 준비 화면이 그려진다', /문자·메일 발송 준비/.test(text()) && !!document.getElementById('msgbox'));
    ok('1차 안내: 저장한 공통 문구가 채워지고, 이미 안내한 5명은 대상이 아니어서 기록 버튼이 꺼진다', /함께해 주셔서/.test(document.getElementById('msgbox').value) && sTargets().length === 0 && document.querySelector('[data-act="sd-log"]').disabled);
    ok('"해당하는 사람이 없어요" 안내가 보인다', /해당하는 사람이 없어요/.test(text()));

    click('[data-act="sd-stage"][data-v="pay"]');
    var T = sTargets(), first = X.person[T[0].person_id];
    ok('입금 요청: 대상이 입금 미완료 2명, 방식은 문자', T.length === 2 && S.send.channel === 'sms' && S.send.filter === 'unpaid', T.length + '/' + S.send.channel);
    var pv = document.getElementById('pv').textContent;
    ok('미리보기: 첫 대상자 이름·참가비·환불기한이 채워지고 자리표시자가 남지 않는다', pv.indexOf(first.name) >= 0 && pv.indexOf('50,000') >= 0 && pv.indexOf('{') < 0 && /11\/22\(일\)/.test(pv), pv);
    ok('미리보기 아래에 글자 수와 단문/장문 구분이 나온다', /자/.test(document.getElementById('cnt').textContent) && /(단문|장문)/.test(document.getElementById('cnt').textContent));

    click('[data-act="sd-stage"][data-v="m2"]');
    ok('최종 안내: 이 프로그램 전용(최근) 문구가 먼저 채워진다 (준비물 포함)', /노트북/.test(document.getElementById('msgbox').value) && sTargets().length === 5);
    ok('최종 안내: 안내 완료 표시 체크칸이 보인다', !!document.getElementById('sd-mark') && document.getElementById('sd-mark').checked);

    click('[data-act="sd-stage"][data-v="sat"]');
    ok('만족도 요청: 폼 링크가 비어 있으면 안내가 나오고 {폼링크}가 그대로 남는다', /만족도 폼 링크가 아직 없어요/.test(text()) && /\{폼링크\}/.test(document.getElementById('pv').textContent));

    click('[data-act="sd-stage"][data-v="etc"]');
    setVal('msgbox', '{이름}님 {폼링크} <img src=x onerror="window.__XSS=1">');
    ok('직접 쓰면 미리보기가 바로 바뀐다 (경고 포함)', /\{폼링크\}/.test(document.getElementById('pv').textContent) && /만족도 폼 링크가 아직 없어요/.test(document.getElementById('sd-warn').textContent));
    X.prog.w.form_url = 'https://forms.example.com/sat'; sendRefreshPreview();
    ok('폼 링크가 있으면 채워지고 경고가 사라진다', document.getElementById('pv').textContent.indexOf('https://forms.example.com/sat') >= 0 && !/아직 없어요/.test(document.getElementById('sd-warn').textContent));
    ok('문구 속 스크립트는 글자로만 보인다', !window.__XSS && document.getElementById('pv').textContent.indexOf('<img') >= 0);
    setVal('msgbox', '{이름}님 안녕하세요. {참가비}원 {환불기한}');

    // 복사
    click('[data-act="sd-copy-msg"]');
    return waitFor(function () { return copied.length === 1; }, '문구 복사').then(function () {
      var T2 = sTargets(), p1 = X.person[T2[0].person_id];
      ok('문구 복사: 첫 대상자 기준으로 채운 글이 복사된다', copied[0].indexOf(p1.name) >= 0 && copied[0].indexOf('{') < 0, copied[0]);
      click('[data-act="sd-copy-rcpt"]');
      return waitFor(function () { return copied.length === 2; }, '번호 복사');
    }).then(function () {
      var phones = sTargets().map(function (e) { return X.person[e.person_id].phone; });
      ok('번호 복사: 대상 전원의 번호가 쉼표로 이어져 복사된다', copied[1] === phones.join(','), copied[1]);
      click('[data-act="sd-copy-one"]');
      return waitFor(function () { return copied.length === 3; }, '사람별 복사');
    }).then(function () {
      ok('사람별 복사: 그 사람 이름이 들어간 문구가 복사된다', copied[2].indexOf(X.person[sTargets()[0].person_id].name) >= 0);
      failCopy = true; click('[data-act="sd-copy-msg"]');
      return waitFor(function () { return S.modal && S.modal.title === '복사하는 창'; }, '복사 막힘 대체 창');
    }).then(function () {
      ok('복사가 막히면 선택해서 복사하는 창이 뜬다 (글이 들어 있다)', document.getElementById('copy-fallback').value.indexOf('안녕하세요') >= 0);
      click('#modal-yes'); failCopy = false;

      // 저장·불러오기·삭제
      var n0 = S.boot.templates.length;
      setVal('sv-name', '시험 저장 문구'); document.getElementById('sv-stage').value = 'etc'; fire(document.getElementById('sv-stage'), 'change');
      document.getElementById('sv-prog').value = 'w'; fire(document.getElementById('sv-prog'), 'change');
      click('[data-act="sd-save"]');
      return waitFor(function () { return S.boot.templates.length === n0 + 1; }, '문구 저장');
    }).then(function () {
      var row = S.boot.templates.filter(function (x) { return x.name === '시험 저장 문구'; })[0];
      ok('문구 저장: 자리표시자 상태 그대로 저장된다 (채운 글이 아님)', row && row.body === '{이름}님 안녕하세요. {참가비}원 {환불기한}' && row.stage === 'etc' && row.program_id === 'w');
      ok('저장한 문구가 목록에 보인다', /시험 저장 문구/.test(text()));
      var cBefore = S.boot.templates.length;
      click('[data-act="sd-save"]');   // 같은 이름·단계·프로그램: 덮어쓰기
      return sleep(300).then(function () {
        ok('같은 이름·단계·프로그램으로 다시 저장하면 덮어쓴다 (개수 그대로)', S.boot.templates.length === cBefore && S.boot.templates.filter(function (x) { return x.name === '시험 저장 문구'; }).length === 1);
        setVal('sv-name', '나쁜 문구'); setVal('msgbox', '번호 900101-1234567');
        var before = S.boot.templates.length; click('[data-act="sd-save"]');
        return sleep(300).then(function () { ok('주민번호 모양이 들어 있으면 저장하지 않는다', S.boot.templates.length === before && !S.boot.templates.some(function (x) { return x.name === '나쁜 문구'; })); });
      });
    }).then(function () {
      setVal('msgbox', '<b onmouseover="window.__XSS=1">굵게</b> {이름}'); setVal('sv-name', '스크립트 문구'); click('[data-act="sd-save"]');
      return waitFor(function () { return S.boot.templates.some(function (x) { return x.name === '스크립트 문구'; }); }, '스크립트 문구 저장');
    }).then(function () {
      S.send.libStage = 'every'; S.send.libProg = 'every'; render();
      ok('저장한 문구 목록의 스크립트도 글자로만 보인다', !window.__XSS && /<b onmouseover/.test(document.querySelector('.card-b').parentNode.parentNode.textContent + text()));
      var saved = S.boot.templates.filter(function (x) { return x.name === '시험 저장 문구'; })[0];
      click('[data-act="sd-use"][data-id="' + saved.tpl_id + '"]');
      ok('불러오기: 문구 입력칸이 저장한 문구로 바뀐다', document.getElementById('msgbox').value === saved.body);
      click('[data-act="sd-del"][data-id="' + saved.tpl_id + '"]');
      return waitFor(function () { return S.modal && /저장한 문구 삭제/.test(S.modal.title); }, '삭제 확인창').then(function () {
        click('#modal-yes');
        return waitFor(function () { return !S.boot.templates.some(function (x) { return x.tpl_id === saved.tpl_id; }); }, '삭제 반영');
      });
    }).then(function () {
      ok('삭제: 목록에서 사라진다', !/시험 저장 문구/.test(text()));
      // 발송 기록
      click('[data-act="sd-stage"][data-v="pay"]');
      var n0 = S.boot.messageLog.length;
      click('[data-act="sd-log"]');
      return waitFor(function () { return S.boot.messageLog.length === n0 + 1; }, '발송 기록');
    }).then(function () {
      var log = S.boot.messageLog[0];
      ok('발송 기록: 인원 수와 자리표시자 상태의 문구가 남고 받는 사람 정보는 없다', log.count === 2 && /\{이름\}/.test(log.body) && !/010-/.test(JSON.stringify(log)));
      ok('발송 기록 표에 새 기록이 보인다', /입금 요청/.test(text()));
      click('[data-act="sd-stage"][data-v="m2"]');
      var m0 = sTargets().length;
      click('[data-act="sd-log"]');
      return waitFor(function () { return S.boot.messageLog[0].stage === 'm2' && S.boot.enrollments.filter(function (e) { return e.session_id === 'w6' && !e.cancel_reason && e.m2_at; }).length === m0 && !S.send.busy; }, '최종 안내 기록과 표시').then(function () {
        ok('최종 안내를 기록하면 대상 전원이 "최종 안내 완료"로 표시되어 대상에서 빠진다', sTargets().length === 0 && m0 === 5, m0 + '/' + sTargets().length);
        ok('안내 완료 표시 뒤 화면의 기록 버튼이 꺼진다', document.querySelector('[data-act="sd-log"]').disabled);
      });
    }).then(function () {
      var h = S.boot.messageLog.filter(function (x) { return x.stage === 'pay'; })[0];
      click('[data-act="sd-hist-use"][data-id="' + h.log_id + '"]');
      ok('다시 쓰기: 그 기록의 단계·방식·문구가 입력칸으로 돌아온다', S.send.stage === 'pay' && document.getElementById('msgbox').value === h.body);
      click('[data-act="sd-hist-save"][data-id="' + h.log_id + '"]');
      ok('기록의 "저장": 문구가 불려오고 저장 이름 칸으로 이동한다', document.getElementById('msgbox').value === h.body && document.getElementById('sv-name').value === '');
    }).catch(function (e) { ok('시험 도중 오류 없이 끝난다', false, e && e.message); })
      .then(function () {
        ok('마지막 확인: 스크립트가 실행되지 않았다', !window.__XSS);
        var box = document.createElement('pre'); box.id = '__report';
        box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:60vh;overflow:auto;margin:0;padding:12px 16px;background:' + (fails ? '#b4390c' : '#17803d') + ';color:#fff;font:12px/1.5 monospace;z-index:99;white-space:pre-wrap';
        box.textContent = (fails ? '실패 ' + fails + '개\n' : '모두 통과 (' + out.length + '개)\n') + out.join('\n');
        document.body.appendChild(box);
        document.title = 'SELFTEST ' + (fails ? 'FAIL ' + fails : 'PASS ' + out.length);
      });
  }
  setTimeout(function () { waitFor(function () { return window.S && S.boot && typeof sendInit === 'function'; }, '앱 준비').then(run).catch(function (e) { document.title = 'SELFTEST ERROR ' + e.message; }); }, 300);
})();

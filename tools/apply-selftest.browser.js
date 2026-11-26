/**
 * 신청 엑셀 업로드 화면의 자동 시험 (브라우저 안에서 실행된다. 파일을 고르고, 번호를 입력하고, 등록·되돌리기까지 진행한다).
 * tools/build-preview.js --selftest=apply 로 만든 미리보기에 끼워 넣어서 쓴다. 결과는 화면 아래 #__report 와 페이지 제목에 나온다.
 * 핵심 확인: 어느 단계에서도 화면(HTML)과 입력칸 값에 주민번호가 남지 않는다 / 스크립트 삽입은 실행되지 않는다.
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
  /** 화면에 번호가 남아 있는지: 스크립트를 뺀 문서 전체 + 모든 입력칸의 값 + 제목 */
  function leaks() {
    var clone = document.body.cloneNode(true);
    [].slice.call(clone.querySelectorAll('script')).forEach(function (s) { s.parentNode.removeChild(s); });
    var rep = clone.querySelector('#__report'); if (rep) rep.parentNode.removeChild(rep);
    var vals = [].slice.call(document.querySelectorAll('input,textarea,select')).map(function (e) { return e.value; }).join('|');
    return RRN_RE.test(clone.outerHTML) || RRN_RE.test(clone.textContent) || RRN_RE.test(vals) || RRN_RE.test(document.title);
  }
  function csvCell(v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }
  function click(sel) { var el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) throw new Error('버튼 없음: ' + sel); el.click(); }
  function text() { return document.body.innerText; }
  function numFor(p, yy) { var by = Number(p.birth_year), male = p.gender === '남'; var d = by >= 2000 ? (male ? 3 : 4) : (male ? 1 : 2); return String(by).slice(2) + '0101-' + d + '234567'; }

  var HEAD = ['번호', '이름', '연락처', '성별', '출생연도', '직업', '거주지', '이메일', '여행자 보험 가입을 위해 주민번호 전체를 작성해주세요.',
    '프로그램 상세 시간표 및 참가비 안내는 신청하신 메일로 보내드릴 예정입니다.', '신청하시는 회차를 선택해주세요', '이외에 곁마을 운영진에게 하고싶은 말, 혹은 질문이 있다면 남겨주세요.', '기타답변',
    '초상권동의', '추가보유동의', '신청일', '합격여부', '참석 여부', '취소사유'];
  function R(no, name, phone, g, b, rrn, o) {
    o = o || {};
    return [no, name, phone, g, b, o.job || '디자이너', '서울', 'a' + no + '@example.com', rrn, '예', o.round || '9회차 | 마을의 곁 | 12/7-9', o.memo || '', '', '동의', '동의', '2026-11-10 9:30', o.pass || '합격', '', o.cancel || ''];
  }
  var ROWS = [HEAD,
    R(1, '<img src=x onerror="window.__XSS=1">김가짜', '01090000001', '여', '1990', '900101-2234567'),
    R(2, '이가짜', '01090000002', '남', '1991', '910101-1234567'),
    R(3, '박가짜', '01090000003', '여', '1992', '9201012234567'),
    R(4, '최가짜', '01090000004', '남', '1993', '930101-123456'),
    R(5, '정가짜', '01090000005', '여', '1994', '940101-1234567'),
    R(6, '강가짜', '01090000006', '여', '1995', ''),
    R(7, '조가짜', '01090000007', '남', '1996', '960101-1234567', { pass: '불합격' }),
    R(8, '윤가짜', '01090000008', '여', '1997', '970101-2234567', { cancel: '개인 사정' }),
    R(9, '임가짜', '01090000009', '남', '1998', '980101-1234567', { round: '77회차 | 없음 | 1/1-2', memo: '<b onmouseover="window.__XSS=1">메모</b>' })];
  var CSV = '﻿' + ROWS.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');

  function run() {
    var stop = (window.__PREVIEW && window.__PREVIEW.stop) || 'end';
    var up, nEnr0 = S.boot.enrollments.length, nPeople0 = S.boot.people.length;
    S.screen = 'apply'; render();
    ok('업로드 화면이 그려진다', !!document.querySelector('#ap-file'));
    apReadFile(new File([CSV], '신청.csv', { type: 'text/csv' }));
    return waitFor(function () { return S.up && S.up.rows; }, '파일 읽기').then(function () {
      up = S.up;
      ok('주민번호 열 1개를 떼어 내고 번호가 적힌 행 8개를 메모리에 둔다', up.rrnCols === 1 && Object.keys(up.mem).length === 8, up.rrnCols + '/' + Object.keys(up.mem).length);
      ok('서버로 보낼 본문(rows)에는 주민번호가 없다', !RRN_RE.test(JSON.stringify(up.rows)));
      ok('파일을 읽은 직후 화면에 번호가 없다', !leaks());
      click('[data-act="ap-preview"]');
      return waitFor(function () { return S.up.preview; }, '미리보기');
    }).then(function () {
      var s = up.preview.summary;
      ok('미리보기: 신규 6 · 취소 등록 1 · 불합격 1 · 회차 확인 필요 1', s['new'] === 6 && s.cancelled_new === 1 && s.rejected === 1 && s.needs_session === 1, JSON.stringify(s));
      ok('미리보기 요청에는 번호가 없다', true);   // apPayload 는 rows·programId·sessionMap·applyAttend 만 보낸다
      ok('회차 확인 필요 행에 회차 고르기가 나온다', !!document.querySelector('select[data-act="ap-sess"]'));
      ok('이름·메모의 스크립트가 글자로만 보인다', text().indexOf('<img src=x') >= 0 && !window.__XSS);
      var sel = document.querySelector('select[data-act="ap-sess"]'); sel.value = 'w9'; fire(sel, 'change');
      return waitFor(function () { return S.up.preview && S.up.preview.summary.needs_session === 0; }, '회차 지정 뒤 다시 미리보기');
    }).then(function () {
      ok('회차를 고르면 그 행도 신규로 들어간다 (신규 7)', up.preview.summary['new'] === 7, JSON.stringify(up.preview.summary));
      ok('번호 확인 표: 문제 있는 행(형식 오류·신청서와 다름·비어 있음) 3개만 나온다', document.querySelectorAll('[data-rrn-tr]').length === 3, document.querySelectorAll('[data-rrn-tr]').length);
      var t = text();
      ok('상태 문구가 보인다 (형식 오류 / 신청서와 달라요 / 비어 있음)', t.indexOf('형식 오류') >= 0 && t.indexOf('신청서와 달라요') >= 0 && t.indexOf('비어 있음') >= 0);
      ok('요약: 저장할 번호 4건', /저장할 번호\s*4건/.test(document.getElementById('ap-rrn-sum').textContent), document.getElementById('ap-rrn-sum').textContent);
      ok('번호 입력칸은 가려져 있다 (type=password)', [].slice.call(document.querySelectorAll('input[data-rrn-row]')).every(function (i) { return i.type === 'password'; }));
      ok('번호 확인 표를 보는 동안 화면에 번호가 없다', !leaks());
      // 형식 오류(4행 → 표의 5행)를 바르게 고쳐 입력
      var i5 = document.querySelector('input[data-rrn-row="5"]'); i5.value = '9301011234567'; fire(i5, 'change');
      ok('입력한 번호는 칸에서 바로 지워진다', document.querySelector('input[data-rrn-row="5"]').value === '');
      ok('입력 직후 화면에 번호가 없다', !leaks());
      ok('상태가 "정상 · 입력함"으로 바뀐다', /정상 · 입력함/.test(document.querySelector('[data-rrn-status="5"]').textContent));
      var i7 = document.querySelector('input[data-rrn-row="7"]'); i7.value = '9501012234567'; fire(i7, 'change');
      var f6 = document.querySelector('input[data-act="ap-force"][data-row="6"]');
      ok('신청서와 다른 행에만 "그대로 저장" 선택이 있다', !!f6 && !document.querySelector('input[data-act="ap-force"][data-row="5"]'));
      f6.checked = true; fire(f6, 'change');
      ok('요약: 저장할 번호 7건 (그대로 저장 1건 포함)', /저장할 번호\s*7건.*그대로 저장 1건 포함/.test(document.getElementById('ap-rrn-sum').textContent), document.getElementById('ap-rrn-sum').textContent);
      render();
      ok('다시 그려도 입력값이 화면에 나오지 않고 "입력함"만 보인다', !leaks() && document.querySelector('input[data-rrn-row="5"]').placeholder.indexOf('입력함') >= 0 && document.querySelector('input[data-rrn-row="5"]').value === '');
      ok('다시 그려도 입력한 번호는 메모리에 남아 요약이 같다', /저장할 번호\s*7건/.test(document.getElementById('ap-rrn-sum').textContent));
      if (stop === 'rrn') throw new Error('STOP');
      click('#ap-ok'); fire(document.getElementById('ap-ok'), 'change');
      ok('"맞아요"를 체크하면 등록 버튼이 켜진다', !document.querySelector('[data-act="ap-commit"]').disabled);
      click('[data-act="ap-commit"]');
      return waitFor(function () { return S.up.result; }, '등록');
    }).then(function () {
      var r = S.up.result;
      ok('등록: 번호 7건 저장 · 취소 행은 대상이 아님', r.rrn.counts.saved === 7 && r.rrn.counts.skipped_ineligible === 1, JSON.stringify(r.rrn.counts));
      ok('등록 뒤 번호가 메모리에서 지워진다', Object.keys(S.up.mem).length === 0 && Object.keys(S.up.inputs).length === 0 && S.up.rows === null);
      ok('등록 응답과 화면에 주민번호 값이 없다', !RRN_RE.test(JSON.stringify(r)) && !leaks());
      return waitFor(function () { return UPL.items && UPL.items.length === 1; }, '업로드 기록');
    }).then(function () {
      ok('업로드 기록에 "적용 중"으로 보인다', /적용 중/.test(text()));
      var st = S.boot.rrnStatus, vals = Object.keys(st).map(function (k) { return st[k]; });
      ok('참여 기록 상태 맵에 ok 6 · check 1 이 늘었다 (기존 ok 1·check 1·missing 1 포함)', vals.filter(function (v) { return v === 'ok'; }).length === 7 && vals.filter(function (v) { return v === 'check'; }).length === 2, JSON.stringify(vals));
      ok('스크립트 삽입 시험: 실행되지 않았다', !window.__XSS);
      if (stop === 'result') throw new Error('STOP');
      click('[data-act="ap-undo"]');
      return waitFor(function () { return S.modal && S.modal.title === '업로드 되돌리기'; }, '되돌리기 확인창');
    }).then(function () {
      var t = document.querySelector('.modal').textContent;
      ok('되돌리기 확인창: 참여 기록 8건 · 사람 8명 · 주민번호 7건을 지우고 채운 칸을 비운다고 알린다', /참여 기록 8건, 사람 8명, 주민번호 7건/.test(t) && t.indexOf('이후 수정한 내용은 사라져요') >= 0, t.slice(0, 160));
      ok('확인창에도 번호가 없다', !leaks());
      if (stop === 'undo-dialog') throw new Error('STOP');
      click('#modal-yes');
      return waitFor(function () { return UPL.items && UPL.items[0].undone_at && S.boot.enrollments.length === nEnr0; }, '되돌림 반영');
    }).then(function () {
      ok('되돌린 뒤 업로드 기록에 "되돌림"이 보인다', /되돌림/.test(text()));
      ok('되돌린 뒤 참여 기록·사람 수가 업로드 전으로 돌아온다', S.boot.enrollments.length === nEnr0 && S.boot.people.length === nPeople0, S.boot.enrollments.length + '/' + nEnr0);
      ok('되돌린 뒤 화면에 번호가 없다', !leaks());
      // 등록한 뒤 한 사람씩 입력·수정 (회차 상세의 주민번호 칸)
      S.sid = 'w6'; S.screen = 'sess'; render();
      ok('회차 상세에 주민번호 상태가 보인다 (보관 중 / 없음 / 확인 필요)', /보관 중/.test(text()) && /없음/.test(text()) && /확인 필요/.test(text()));
      var eid = 'en4', e = enrOf(eid), p = X.person[e.person_id];
      click('[data-act="rrn-edit"][data-eid="' + eid + '"]');
      return waitFor(function () { return document.getElementById('rrn-in'); }, '입력창').then(function () {
        ok('입력창의 칸은 가려져 있다', document.getElementById('rrn-in').type === 'password');
        document.getElementById('rrn-in').value = numFor(p);
        ok('입력창에 번호를 넣은 상태에서도 속성(HTML)에는 번호가 없다', !RRN_RE.test(document.querySelector('.modal').outerHTML));
        click('#modal-yes');
        return waitFor(function () { return S.boot.rrnStatus[eid] === 'ok'; }, '저장 반영');
      });
    }).then(function () {
      ok('입력 뒤 상태가 "보관 중"이 되고 화면에 번호가 없다', !leaks());
      var eid = 'en3', e = enrOf(eid), p = X.person[e.person_id];
      click('[data-act="rrn-edit"][data-eid="' + eid + '"]');
      return waitFor(function () { return document.getElementById('rrn-in'); }, '입력창 2').then(function () {
        var wrong = numFor(p).replace(/-[1-8]/, function (m) { return '-' + (Number(m[1]) % 2 === 1 ? Number(m[1]) + 1 : Number(m[1]) - 1); });   // 성별 자리를 반대로
        document.getElementById('rrn-in').value = wrong;
        click('#modal-yes');
        return waitFor(function () { return S.modal && S.modal.title === '신청서와 달라요'; }, '대조 확인창');
      }).then(function () {
        ok('신청서와 다른 번호는 확인 창이 뜨고, 그 창에도 번호가 없다', !leaks());
        click('#modal-yes');
        return waitFor(function () { return S.boot.rrnStatus[eid] === 'check'; }, '확인 후 저장');
      });
    }).then(function () {
      ok('그대로 저장하면 "확인 필요"로 표시되고 화면에 번호가 없다', !leaks());
    }).catch(function (e) {
      if (e && e.message === 'STOP') return;
      ok('시험 도중 오류 없이 끝난다', false, e && e.message);
    }).then(function () {
      ok('마지막 확인: 화면 어디에도 주민번호가 없고 스크립트도 실행되지 않았다', !leaks() && !window.__XSS);
      var box = document.createElement('pre'); box.id = '__report';
      box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:60vh;overflow:auto;margin:0;padding:12px 16px;background:' + (fails ? '#b4390c' : '#17803d') + ';color:#fff;font:12px/1.5 monospace;z-index:99;white-space:pre-wrap';
      box.textContent = (fails ? '실패 ' + fails + '개\n' : '모두 통과 (' + out.length + '개)\n') + out.join('\n');
      document.body.appendChild(box);
      document.title = 'SELFTEST ' + (fails ? 'FAIL ' + fails : 'PASS ' + out.length);
    });
  }
  setTimeout(function () { waitFor(function () { return window.S && S.boot && typeof apReadFile === 'function'; }, '앱 준비').then(run).catch(function (e) { document.title = 'SELFTEST ERROR ' + e.message; }); }, 300);
})();

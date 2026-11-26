/**
 * 보험 명단 내려받기·가입 완료 처리와 만족도 열의 브라우저 자동 시험. (build-preview.js --selftest=insurance 로 만든 미리보기에서 실행)
 * 핵심 확인: 명단 엑셀에는 이름·번호(하이픈 포함)만 첫 줄부터 들어가고, 화면(HTML)에는 어느 단계에서도 주민번호가 없다.
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
  var RRN_RE = /(?<!\d)\d{6}\s*-?\s*[1-8]\d{6}(?!\d)/;
  function leaks() {
    var clone = document.body.cloneNode(true);
    [].slice.call(clone.querySelectorAll('script')).forEach(function (s) { s.parentNode.removeChild(s); });
    var rep = clone.querySelector('#__report'); if (rep) rep.parentNode.removeChild(rep);
    var vals = [].slice.call(document.querySelectorAll('input,textarea,select')).map(function (e) { return e.value; }).join('|');
    return RRN_RE.test(clone.outerHTML) || RRN_RE.test(clone.textContent) || RRN_RE.test(vals);
  }
  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }
  function click(sel) { var el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) throw new Error('버튼 없음: ' + sel); el.click(); }
  function text() { return document.body.innerText; }
  function numFor(p) { var by = Number(p.birth_year), male = p.gender === '남'; var d = by >= 2000 ? (male ? 3 : 4) : (male ? 1 : 2); return String(by).slice(2) + '0101-' + d + '234567'; }

  function run() {
    var captured = null, per = {};
    window.saveBlob = function (blob, name) { captured = { blob: blob, name: name }; };    // 파일 저장 대신 내용을 붙잡는다
    S.sid = 'w6'; S.screen = 'sess'; render();
    ok('회차 상세에 "보험사 명단" 버튼과 "만족도" 열이 있다', !!document.querySelector('[data-act="ins-open"]') && /만족도/.test(document.querySelector('thead').textContent));
    ok('시작 전 회차에는 만족도 체크 버튼이 없다', !document.querySelector('[data-step="sat"]'));
    click('[data-act="ins-open"]');
    return waitFor(function () { return S.ins && S.ins.data; }, '명단 불러오기').then(function () {
      var d = S.ins.data;
      ok('명단: 정상 1명 · 빠진 2명(확인 필요·번호 없음) · 이미 완료 2명', d.names.length === 1 && d.excluded.length === 2 && d.done === 2, JSON.stringify({ n: d.names.length, e: d.excluded.map(function (x) { return x.reason; }), d: d.done }));
      var t = text();
      ok('화면에 "확인 필요"와 "번호 없음"이 보이고 번호 입력 버튼이 있다', /확인 필요/.test(t) && /번호 없음/.test(t) && document.querySelectorAll('.panel [data-act="rrn-edit"]').length === 2);
      ok('명단 창에 주민번호가 없다 (확인 필요인 사람의 번호 포함)', !leaks());
      ok('내려받기 전에는 완료 처리 영역이 잠겨 있다', document.querySelector('[data-act="ins-complete"]').disabled);
      // 번호 없는 사람(en4)을 이 창에서 바로 입력
      var p4 = X.person[enrOf('en4').person_id];
      click('.panel [data-act="rrn-edit"][data-eid="en4"]');
      return waitFor(function () { return document.getElementById('rrn-in'); }, '입력창').then(function () {
        document.getElementById('rrn-in').value = numFor(p4);
        click('#modal-yes');
        return waitFor(function () { return S.ins && S.ins.data && S.ins.data.names.length === 2; }, '입력 뒤 명단 다시 불러오기');
      });
    }).then(function () {
      ok('번호를 입력하면 명단이 다시 불러와져 2명이 된다', S.ins.data.names.length === 2 && S.ins.data.excluded.length === 1);
      ok('입력 뒤에도 화면에 번호가 없다', !leaks());
      click('[data-act="ins-download"]');
      return waitFor(function () { return captured; }, '파일 만들기');
    }).then(function () {
      return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsArrayBuffer(captured.blob); });
    }).then(function (buf) {
      var wb = XLSX.read(buf, { type: 'array' }), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
      var p2 = X.person[enrOf('en2').person_id], p4 = X.person[enrOf('en4').person_id];
      ok('엑셀: 첫 줄부터 이름·주민번호(하이픈 포함)만, 제목 줄 없음 (2행)', rows.length === 2 && rows[0].length === 2 && rows[0][0] === p2.name && rows[0][1] === numFor(p2) && rows[1][0] === p4.name && rows[1][1] === numFor(p4), JSON.stringify(rows.map(function (r) { return r[0]; })));
      ok('엑셀 파일 이름: 보험명단_프로그램회차_날짜.xlsx', /^보험명단_일해보기6회_20261118\.xlsx$/.test(captured.name), captured.name);
      var p3 = X.person[enrOf('en3').person_id];
      ok('확인 필요인 사람(en3)은 엑셀에 없다', rows.every(function (r) { return r[0] !== p3.name; }) && !/990101/.test(JSON.stringify(rows)));
      ok('내려받은 뒤에도 화면에 번호가 없다', !leaks());
      ok('내려받은 뒤 파일 이름 안내가 보이고 완료 처리는 체크 전까지 꺼져 있다', text().indexOf(captured.name) >= 0 && document.querySelector('[data-act="ins-complete"]').disabled);
      var box = document.getElementById('ins-ok'); box.checked = true; fire(box, 'change');
      ok('"올렸어요"를 체크하면 완료 처리 버튼이 켜진다', !document.querySelector('[data-act="ins-complete"]').disabled);
      click('[data-act="ins-complete"]');
      return waitFor(function () { return S.ins && S.ins.completed; }, '완료 처리');
    }).then(function () {
      ok('완료 처리: 2명이 가입 완료로 바뀌고 번호 상태에서 빠진다', !!enrOf('en2').ins_at && !!enrOf('en4').ins_at && S.boot.rrnStatus.en2 === undefined && S.boot.rrnStatus.en4 === undefined && S.boot.rrnStatus.en3 === 'check');
      ok('완료 뒤 "파일을 컴퓨터에서 지워 달라"는 안내가 나온다', /컴퓨터에서 지워/.test(text()));
      ok('완료 뒤 메모리의 번호 명단이 비워진다', INS_ROWS === null);
      ok('완료 뒤 화면에 번호가 없다', !leaks());
      click('[data-act="ins-close"]');
      ok('닫으면 창이 사라진다', S.ins === null && !document.querySelector('.panel'));
      click('[data-act="ins-open"]');
      return waitFor(function () { return S.ins && S.ins.data; }, '다시 열기');
    }).then(function () {
      var d = S.ins.data;
      ok('다시 열면 대상 0명 · 빠진 1명(확인 필요) · 이미 완료 4명', d.names.length === 0 && d.excluded.length === 1 && d.done === 4, JSON.stringify({ n: d.names.length, e: d.excluded.length, d: d.done }));
      ok('대상이 없으면 내려받기 버튼이 꺼져 있다', document.querySelector('[data-act="ins-download"]').disabled);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      ok('Esc 로 닫힌다', S.ins === null);
      // 만족도: 이미 시작한(끝난) 1회차에서
      S.sid = 'w1'; S.screen = 'sess'; render();
      var firstBtn = document.querySelector('[data-act="attend"]');
      var eid = firstBtn.getAttribute('data-eid');
      click(firstBtn);
      return waitFor(function () { return enrOf(eid).attend === '참석' && !S.pending[eid]; }, '참석 처리').then(function () {
        var sat = document.querySelector('[data-act="step"][data-step="sat"][data-eid="' + eid + '"]');
        ok('시작한 회차에는 만족도 체크 버튼이 있다', !!sat);
        click(sat);
        return waitFor(function () { return !!enrOf(eid).sat_at && !S.pending[eid]; }, '만족도 체크');
      }).then(function () {
        ok('만족도를 체크하면 응답일이 기록된다', enrOf(eid).sat_at === S.boot.today);
        var k = satKpi(S.boot);
        ok('만족도 응답률은 참석자를 분모로 센다 (1/참석자 수)', !!k && k.done === 1 && k.total >= 1, JSON.stringify(k));
        S.screen = 'dash'; render();
        ok('홈 대시보드에 "만족도 응답률" 카드가 보인다', /만족도 응답률/.test(text()) && /참석자 1\/\d+명 응답/.test(text()), text().slice(0, 200));
      });
    }).catch(function (e) { ok('시험 도중 오류 없이 끝난다', false, e && e.message); })
      .then(function () {
        ok('마지막 확인: 화면 어디에도 주민번호가 없다', !leaks());
        var box = document.createElement('pre'); box.id = '__report';
        box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:60vh;overflow:auto;margin:0;padding:12px 16px;background:' + (fails ? '#b4390c' : '#17803d') + ';color:#fff;font:12px/1.5 monospace;z-index:99;white-space:pre-wrap';
        box.textContent = (fails ? '실패 ' + fails + '개\n' : '모두 통과 (' + out.length + '개)\n') + out.join('\n');
        document.body.appendChild(box);
        document.title = 'SELFTEST ' + (fails ? 'FAIL ' + fails : 'PASS ' + out.length);
      });
  }
  setTimeout(function () { waitFor(function () { return window.S && S.boot && typeof insOpen === 'function'; }, '앱 준비').then(run).catch(function (e) { document.title = 'SELFTEST ERROR ' + e.message; }); }, 300);
})();

/**
 * 프로그램 설정(만족도 폼 링크)과 시스템 상태 화면의 브라우저 자동 시험. (build-preview.js --selftest=admin)
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
  function click(sel) { var el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) throw new Error('버튼 없음: ' + sel); el.click(); }
  function text() { return document.body.innerText; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var RRN_RE = /(?<!\d)\d{6}\s*-?\s*[1-8]\d{6}(?!\d)/;

  function run() {
    S.screen = 'sessions'; render();
    ok('회차 관리 맨 위에 프로그램 설정 카드(3개 프로그램의 폼 링크 입력)가 있다', /프로그램 설정/.test(text()) && ['w', 'l', 'g'].every(function (p) { return !!document.getElementById('pg-' + p); }));
    document.getElementById('pg-w').value = 'javascript:alert(1)';
    click('[data-act="pg-save"][data-id="w"]');
    return sleep(300).then(function () {
      ok('http(s) 가 아닌 링크는 저장되지 않는다', !(X.prog.w.form_url) && /http/.test(document.getElementById('toast').textContent), 'toast=' + document.getElementById('toast').textContent + ' busy=' + S.busy + ' url=' + X.prog.w.form_url);
      document.getElementById('pg-w').value = 'https://forms.example.com/w-sat';
      click('[data-act="pg-save"][data-id="w"]');
      return waitFor(function () { return X.prog.w.form_url === 'https://forms.example.com/w-sat'; }, '링크 저장');
    }).then(function () {
      ok('링크가 저장되고 다시 그려도 입력칸에 남아 있다', document.getElementById('pg-w').value === 'https://forms.example.com/w-sat');
      sendInit('w6', 'etc'); S.screen = 'send'; render();
      sendRefreshPreview();
      S.send.body = '{이름}님 {폼링크}'; sendRefreshPreview();
      ok('저장한 링크가 문자·메일 문구의 {폼링크}에 들어간다 (경고 없음)', document.getElementById('pv').textContent.indexOf('https://forms.example.com/w-sat') >= 0 && !/아직 없어요/.test(document.getElementById('sd-warn').textContent));
      S.screen = 'sessions'; render();
      document.getElementById('pg-w').value = '';
      click('[data-act="pg-save"][data-id="w"]');
      return waitFor(function () { return X.prog.w.form_url === ''; }, '링크 지우기');
    }).then(function () {
      ok('비우면 링크가 지워진다', X.prog.w.form_url === '');
      // 소유자가 아니면 시스템 상태가 보이지 않는다
      S.boot.me.role = 'member'; S.screen = 'status'; render();
      ok('운영진(소유자 아님)에게는 사이드바에 시스템 상태가 없고 화면도 막힌다', !/시스템 상태/.test(document.querySelector('.side').textContent) && /소유자만 볼 수 있는 화면/.test(text()));
      S.boot.me.role = 'owner'; S.screen = 'status'; render();
      ok('소유자에게는 사이드바에 시스템 상태가 있다', /시스템 상태/.test(document.querySelector('.side').textContent));
      return waitFor(function () { return STAT.data; }, '상태 불러오기');
    }).then(function () {
      var t = text();
      ok('데이터 파일: 정상 표시와 버전', /데이터 파일/.test(t) && /정상/.test(t) && /미리보기/.test(t));
      ok('자동 정리: 한 번도 안 돌았으면 확인 필요와 경고, 트리거 설정 방법(sweepRrn)이 보인다', /주민번호 자동 정리/.test(t) && /한 번도 실행되지 않았어요/.test(t) && /sweepRrn/.test(t) && /일 단위 타이머/.test(t));
      ok('스키마 확장: 필요한 탭과 열이 보인다', /확장 필요/.test(t) && /Enrollments \(sat_at\)/.test(t));
      ok('보관 중인 주민번호: 개수만 나온다', /보관 중인 주민번호/.test(t) && /가장 오래된 보관일 2026-11-17/.test(t));
      ok('개인정보 점검: 아직 점검한 적이 없다고 나온다', /아직 점검한 적이 없어요/.test(t));
      ok('시스템 상태 화면에 주민번호 모양의 값이 없다', !RRN_RE.test(document.body.innerText));
      click('[data-act="st-scan"]');
      return waitFor(function () { return STAT.scan && !STAT.busy; }, '점검');
    }).then(function () {
      return sleep(150);
    }).then(function () {
      ok('개인정보 점검: 0개면 정상 안내가 나온다', /주민번호 모양의 값이 없어요 \(0개\)/.test(text()));
      STAT.scan = { total: 2, findings: [{ tab: 'Enrollments', column: 'memo', count: 2 }] }; render();
      ok('찾으면 탭·열·개수만 알려 준다 (값 없음)', /Enrollments 탭 · memo 열 · 2개/.test(text()) && !RRN_RE.test(document.body.innerText));
      STAT.scan = null;
      click('[data-act="st-migrate"]');
      return waitFor(function () { return STAT.data && STAT.data.schema.needs.length === 0 && !STAT.busy; }, '스키마 확장');
    }).then(function () {
      ok('스키마 확장을 누르면 "최신"으로 바뀐다', /모든 탭의 열이 최신이에요/.test(text()));
      click('[data-act="st-backup"]');
      return waitFor(function () { return /백업했어요/.test(document.getElementById('toast').textContent); }, '백업');
    }).then(function () {
      ok('백업을 누르면 백업 이름이 안내된다', /곁마을 운영 DB 백업/.test(document.getElementById('toast').textContent));
      // 스크립트 삽입: 탭 이름·문제 문구가 글자로만 보인다
      STAT.data.db.ok = false; STAT.data.db.tabs = [{ name: '<img src=x onerror="window.__XSS=1">', ok: false, rows: 0, problem: '<b onmouseover="window.__XSS=1">없는 열</b>' }]; render();
      ok('탭 이름·문제 문구의 스크립트는 글자로만 보이고 실행되지 않는다', !window.__XSS && /<img src=x/.test(text()));
    }).catch(function (e) { ok('시험 도중 오류 없이 끝난다', false, e && e.message); })
      .then(function () {
        ok('마지막 확인: 화면에 주민번호가 없고 스크립트도 실행되지 않았다', !RRN_RE.test(document.body.innerText) && !window.__XSS);
        var box = document.createElement('pre'); box.id = '__report';
        box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:60vh;overflow:auto;margin:0;padding:12px 16px;background:' + (fails ? '#b4390c' : '#17803d') + ';color:#fff;font:12px/1.5 monospace;z-index:99;white-space:pre-wrap';
        box.textContent = (fails ? '실패 ' + fails + '개\n' : '모두 통과 (' + out.length + '개)\n') + out.join('\n');
        document.body.appendChild(box);
        document.title = 'SELFTEST ' + (fails ? 'FAIL ' + fails : 'PASS ' + out.length);
      });
  }
  setTimeout(function () { waitFor(function () { return window.S && S.boot && typeof statusHtml === 'function'; }, '앱 준비').then(run).catch(function (e) { document.title = 'SELFTEST ERROR ' + e.message; }); }, 300);
})();

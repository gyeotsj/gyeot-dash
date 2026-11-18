# 곁마을 운영 대시보드: 개발·설정 안내

담당자가 바뀌어도 설정을 이어받을 수 있도록 남기는 문서입니다. 설계 배경은 [TECH_DESIGN.md](../TECH_DESIGN.md), 기능은 [PRD.md](../PRD.md)를 보세요.

## 1. 구성 한눈에 보기

```
브라우저 ──▶ Apps Script 웹앱 ──▶ 운영 DB (구글 시트)
                  │            └▶ 주민번호 파일 (구글 시트, 별도)
                  └▶ 구글폼 응답 시트 ×3 (읽기 전용, 1단계 이후)
```

| 파일 | 역할 |
|---|---|
| `appsscript.json` | 시간대(서울), 웹앱 설정(접속한 사용자 권한으로 실행), 권한 범위 |
| `Schema.gs` | **탭과 열 정의의 단일 기준.** 열을 추가·수정할 때는 여기를 먼저 고친다 |
| `Lib.gs` | 순수 계산 함수 (이메일 정규화, 주민번호 모양 검사 등). 구글 서비스를 쓰지 않음 |
| `Db.gs` | 시트 읽기·쓰기 도우미, 잠금, 감사 기록, 탭 점검 |
| `Setup.gs` | `setup()`: 폴더, 시트 2개, 탭, 초기 데이터 생성. 여러 번 실행해도 안전 |
| `Code.gs` | 웹앱 진입점 `doGet()`. 접속자 이메일 확인 → 운영진 확인 → 화면 |
| `Index.html`, `Style.html` | 화면 |
| `tests/run.js` | `Lib.gs`, `Schema.gs`의 테스트 (구글에 올라가지 않음) |

## 2. 처음 설정하는 순서 (이미 완료됨. 새로 구성할 때 참고)

1. **도구**: Node.js LTS, Git 설치 → `npm install -g @google/clasp`
2. **구글**: 소유자 계정에서 2단계 인증 확인, https://script.google.com/home/usersettings 에서 Apps Script API 켜기
3. **로그인**: `clasp login` (소유자 계정으로)
4. **프로젝트**: 이 저장소의 `.clasp.json`이 이미 스크립트에 연결돼 있다. 새로 만들려면 `clasp create --type standalone --title "곁마을 운영 대시보드" --rootDir app`
5. **업로드**: `clasp push`
6. **초기 설정**: Apps Script 편집기에서 `setup` 함수를 실행한다. 처음에는 권한 승인 창이 뜨고, "확인되지 않은 앱" 경고는 고급 → 이동으로 넘어간다 (개인용 스크립트라 정상)
7. **배포**: `clasp create-deployment --description "..."` 로 웹앱 배포를 만든다
8. **확인**: 배포 주소를 열어 "접속 성공" 화면과 탭 11개 "정상"을 본다

## 3. 코드를 고치고 반영하는 방법

```
node app/tests/run.js                 # 1) 테스트 (프로젝트 폴더에서)
clasp push                            # 2) 코드를 구글에 올림 (테스트용 /dev 주소에는 바로 반영)
clasp create-deployment --deploymentId <배포ID> --description "변경 내용"   # 3) 실제 주소에 새 버전 반영
git add -A ; git commit -m "변경 내용"   # 4) 이력 남기기
```

- 3번에서 **기존 배포 ID를 지정**해야 웹앱 주소가 바뀌지 않는다. ID를 빼면 새 주소가 생긴다.
- 현재 배포 ID와 주소는 아래 "현재 배포 정보"에 있다.
- 새 PowerShell 창에서 `clasp`, `node` 명령을 못 찾으면 창을 새로 열거나 `$env:Path += ";$env:APPDATA\npm"` 을 실행한다.
- Apps Script 편집기에서 코드를 직접 고쳤다면 `clasp pull`로 이 폴더에 가져와 어긋나지 않게 한다.

## 4. 스크립트 속성 (Apps Script 편집기 → 프로젝트 설정 → 스크립트 속성)

| 이름 | 내용 |
|---|---|
| `DB_ID` | 운영 DB 스프레드시트 ID |
| `RRN_ID` | 주민번호 스프레드시트 ID |
| `ROOT_FOLDER_ID` | 드라이브 `곁마을 운영` 폴더 ID |
| `BACKUP_FOLDER_ID` | `곁마을 운영/백업` 폴더 ID |

`setup()`이 자동으로 채운다. 이 값을 지우고 `setup()`을 다시 실행하면 **새 파일이 또 생기므로**, 지우지 않는다.
복구 때 운영 DB를 백업본으로 바꾸려면 `DB_ID`만 백업본의 ID로 바꾼다.

## 5. 소유자와 소유권 이전

- 소유자 이메일은 `Schema.gs`의 `OWNER_EMAIL`에 있다. 이 계정만 `setup()`을 실행할 수 있다.
- 폴더, 시트 2개, 스크립트 프로젝트의 소유자는 모두 같은 계정이어야 한다. (연말 영구 삭제, 백업 정리, 운영진 공유 관리를 소유자만 할 수 있기 때문)
- 소유자를 바꿀 때: ① 드라이브에서 `곁마을 운영` 폴더와 파일 2개의 소유권을 새 계정으로 이전 ② Apps Script 프로젝트를 새 계정과 공유 후 소유권 이전 ③ `OWNER_EMAIL` 수정과 `Staff` 탭의 role 변경 ④ 새 계정에서 `clasp login` 후 배포를 다시 만든다.

## 6. 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 웹앱에서 "데이터에 접근할 권한이 없습니다" | 그 계정에 운영 DB 스프레드시트가 공유돼 있는지. 소유자가 해당 파일을 편집자로 공유한다 |
| "등록된 운영진이 아닙니다" | 운영 DB의 `Staff` 탭에 그 이메일이 있고 `active`가 `Y`인지 (대소문자는 무시됨) |
| "아직 초기 설정 전입니다" | 스크립트 속성에 `DB_ID`가 없다. 소유자가 `setup()`을 실행한다 |
| 접속 때 권한 승인 창이 계속 뜸 | 새 권한 범위를 추가했을 때 정상이다. 한 번 승인하면 된다 |
| `setup()`이 "소유자만 실행" 오류 | 소유자 계정이 아닌 계정으로 실행했다. 소유자 계정으로 전환한다 |
| `clasp push` 실패: Apps Script API 오류 | https://script.google.com/home/usersettings 에서 API를 켠다 |
| 탭 표에서 "문제" 표시와 메모 | 시트의 첫 행 열 이름이 `Schema.gs` 정의와 다르다. 메모가 알려 주는 열을 맞춘다 (데이터는 지우지 않는다) |

## 7. 현재 배포 정보

| 항목 | 값 |
|---|---|
| 스크립트 ID | `.clasp.json`의 `scriptId` |
| 웹앱 배포 ID | `AKfycbzvFogEE3w5MZAsiSaGL8U1ViRoMCpvNKJJqroPayGl8e1VB6eaqTEsEbOl26UkPg` |
| 웹앱 주소 | `https://script.google.com/macros/s/<위 배포 ID>/exec` |
| 소유자 | `OWNER_EMAIL` 참고 |

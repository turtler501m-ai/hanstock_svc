# Hanstock 프로젝트 분석

작성 기준일: 2026-09-03  
분석 범위: 저장소의 소스 코드, 설정 파일, 운영 스크립트, 테스트 목록과 테스트 계약

이 문서는 현재 체크아웃된 코드의 정적 구조를 설명하는 유지보수용 문서다. 실제 증권 계좌나 운영 VM의 상태를 의미하지 않으며, 비밀값·계좌번호·런타임 데이터는 포함하지 않는다.

## 1. 프로젝트 개요

Hanstock은 국내 주식 자동매매를 위한 독립 Python/FastAPI 서비스다. 주요 기능은 다음과 같다.

- Kiwoom REST API를 통한 국내 주식 계좌·시세·주문 연동
- FastAPI 기반 웹 대시보드와 JSON API
- 전통 전략, 사용자 정의 전략, AI 주식 전략의 스캔·검증·백테스트·페이퍼 트레이딩
- 스케줄러와 VM cron을 이용한 주기적 분석·주문 실행
- 승인 큐, 드라이런, 데모/실계좌 분리, 리스크 한도, 주문 상태 동기화
- SQLite 중심의 로컬 영속화와 `DATABASE_URL`을 통한 PostgreSQL 선택 지원

기본 안전값은 `DRY_RUN=true`, `TRADING_ENV=demo`, `ENABLE_LIVE_TRADING=false`, `REQUIRE_APPROVAL=true`, `AUTONOMY_ENABLED=false`다.

## 2. 상위 구조

```text
src/
├─ dashboard/             FastAPI 앱, 라우트, 서비스, 프레젠터
├─ trader.py              기존 Seven Split 실행 엔진과 실행계획 생성
├─ scheduler.py           실행 사이클, 승인 처리, 주문 상태 동기화
├─ strategy_scheduler.py  DB 스케줄을 읽어 전략별 사이클 디스패치
├─ autonomy_service.py    자율전략 연속 실행 CLI
├─ strategy/              기술지표·전략·백테스트·주문 라우팅
│  └─ autonomy/           TradeIntent 기반 자율전략 안전 파이프라인
├─ ai_stock/              AI 후보 발굴·점수화·포트폴리오·자동화
├─ market_regime/         시장 국면 수집·분류·정책
├─ application/orders/    통합 주문 원장·복구·조정·상태 모델
├─ broker/                브로커 계약과 Kiwoom 구현
├─ db/                    bounded repository, migration, schema
├─ notifier/              Slack 알림
└─ utils/                 로거, 락, 캘린더, 온라인 접근 차단

web/
├─ templates/             index.html, env_settings.html
└─ static/                JavaScript와 CSS

config/                   비밀이 아닌 종목·테마·전략 설정
scripts/local/            Windows 서버·VM 배포 진입점
scripts/vm/               Linux 서버, systemd, cron, 업데이트
tools/                    로컬 검증, 인스턴스 격리, 배포 smoke test
tests/                    unittest 기반 계약·회귀 테스트
```

현재 저장소의 Python 파일은 약 169개이며, 테스트는 자동매매·대시보드·DB·브로커·AI·시장국면·운영 안전성을 폭넓게 다룬다.

## 3. 실행 진입점과 요청 흐름

### 3.1 대시보드

`src.dashboard`가 `src.dashboard.core:app`을 만들고, `pages`, `account`, `settings`, `stock`, `market_regime` 라우터를 등록한다. lifespan에서 스냅샷 갱신, 승인 만료·복구, 주문 상태 관련 운영 작업이 연결된다.

로컬 실행:

```powershell
scripts\local\server.cmd restart
```

내부적으로 `uvicorn src.dashboard:app --host 127.0.0.1 --port 8000`을 실행하며, PID와 로그는 `.runtime/`에 둔다. VM systemd 서비스는 `127.0.0.1:8011`에서 실행된다.

대표 API 영역:

| 영역 | 주요 경로 | 책임 |
|---|---|---|
| 페이지 | `/`, `/env-settings` | 서버 렌더링 화면 |
| 계좌 | `/api/health`, `/api/balance`, `/api/positions` | 상태·잔고·보유종목 |
| 전략/분석 | `/api/signals`, `/api/candidates`, `/api/ai-strategies` | 후보·전략 수명주기 |
| 실행계획 | `/api/execution-plan`, `/api/scheduler/*` | 계획 조회와 수동 실행 |
| 주문/승인 | `/api/orders/*`, `/api/approvals/*` | 주문 원장, 승인, 취소·재시도 |
| 성과 | `/api/performance/*`, `/api/trades/*` | 거래·성과·forward return |
| 시장국면 | `/api/market-regime/*` | 현재 국면, 이력, 진단, 갱신 |
| 설정 | `/api/config`, `/api/env`, `/api/runtime/order-mode` | 런타임 운영 설정 |

대시보드에는 인증 미들웨어와 API 감사 미들웨어가 있으며, `OnlineAccessBlockedError`는 HTTP 409로 변환된다.

### 3.2 일반 자동매매 사이클

```text
스케줄/수동 호출
  → scheduler.run_scheduled_cycle
  → trader.run
  → 브로커 잔고·시세 조회
  → 전략 스캔 및 신호 생성
  → 시장국면 크기 조정·RiskEngine
  → 실행계획/승인 큐 기록
  → 승인 조건 확인
  → Kiwoom 주문 제출 또는 dry-run 기록
  → 거래/주문 상태 저장
  → 브로커 이력과 reconciliation
  → 대시보드·Slack에 결과 표시
```

`strategy_scheduler.py`는 전략별 cron을 만들지 않고 DB의 `strategy_schedules`를 읽는다. 기본 AI 슬롯은 선택된 AI 전략으로 확장되며, 독립 전략은 별도 실행 범주로 분리된다.

### 3.3 자율전략 사이클

`strategy/autonomy`는 일반 trader 경로와 별도의 안전 경계다.

```text
MarketContext + PortfolioContext
  → StrategyAdapter.scan/manage_position
  → lifecycle gate
  → TradeIntent 검증
  → 신뢰된 risk snapshot 확인
  → RiskEnvelope 평가
  → risk reservation
  → strategy position / managed order 기록
  → approval bridge 및 ManagedExecutionCoordinator
  → broker 상태 조정·보호주문·복구
```

오케스트레이터는 중복 decision key, 전략/시장 소유권 불일치, 스냅샷 부재, 리스크 평가 실패를 거부 사유로 기록한다. 주문 생성 실패 시 리스크 예약 해제와 pending position 폐기를 시도한다. `autonomy_service.py`는 process lease와 heartbeat를 사용해 연속 실행 프로세스를 관리한다.

## 4. 주요 도메인별 분석

### 브로커 계층

`DomesticStockBroker` Protocol이 잔고, quote, 일봉, 신규·정정·취소 주문, 거래 이력, 주문 스냅샷 계약을 정의한다. `KiwoomBrokerAdapter`는 Kiwoom 응답의 필드명·부호·종목코드(`A005930` 등)를 내부 모델로 정규화한다. `factory.py`가 설정에 따라 브로커를 생성하므로 전략은 Kiwoom 응답 형식에 직접 의존하지 않는다.

### 전략 계층

기술지표와 Seven Split, volatility breakout, RSI limit, plunge bounce, issue/sector rotation, Heikin Ashi scalping, volatility adaptive momentum 전략이 존재한다. `strategy_ids.py`는 주문 귀속과 스케줄 식별자를 중앙 관리한다. 독립 실행 전략은 다음 세 가지다.

- `plunge_bounce_strategy`
- `heikin_ashi_scalping_strategy`
- `volatility_adaptive_momentum_strategy`

### AI 주식 계층

`ai_stock`은 시장데이터 제공, universe/watchlist, 규칙·모델 점수화, 후보 승격, 포트폴리오 배분, 실행계획, 성과와 자동화를 담당한다. AI 전략은 생성 후 static verify, verify, backtest, paper 단계와 승인·retire 상태를 거치며, `ai_auto_approve`와 `ai_allow_candidate_promotion`은 기본적으로 꺼져 있다.

### 시장국면 계층

`market_regime`는 국내 지수와 breadth 데이터를 수집하고 국면을 분류한다. 국면 결과는 신규 리스크 허용, 포지션 크기, preflight 정책에 영향을 줄 수 있으며, 대시보드 API와 VM preflight cron에서 확인할 수 있다.

### 주문 계층

`application/orders`는 주문 의도와 통합 주문 상태를 관리하는 최신 경계다. 기존 `trades`/`approvals` 테이블과 자율전략의 `ai_managed_orders`가 함께 존재하므로, 주문 귀속에는 `strategy_id`, `strategy_version`, `profile_hash`, `client_order_key`, `correlation_id`를 활용한다. 주문 상태는 브로커 이력·잔고와 재조정하며 unknown 상태를 별도 처리한다.

## 5. 설정과 안전 경계

설정은 `src/config.py`의 Pydantic Settings가 `.env`와 환경변수를 읽는다. 계좌·API key·Slack webhook·OpenAI key는 문서나 Git에 기록하지 않는다.

주문 제출 가능성은 다음 세 층으로 나뉜다.

| 상태 | 의미 |
|---|---|
| `dry_run=true` | 실제 주문 없이 계획·거래 기록만 생성 |
| demo + dry-run 해제 | 데모 계좌 주문 제출 가능 |
| real + `enable_live_trading=true` + dry-run 해제 | 실계좌 주문 경로 허용 |

여기에 `online_access_blocked`, `require_approval`, 자율전략의 `autonomy_live_opt_in`이 추가 방어선으로 작동한다. 일반 주문의 주요 리스크 값은 `total_capital`, `cash_buffer`, `max_positions`, `max_single_weight`, `max_daily_loss_pct`, stop-loss/take-profit 설정이다. 자율전략은 별도의 risk envelope와 risk reservation을 사용한다.

## 6. 저장소와 데이터 흐름

기본 DB는 `.runtime/trades.sqlite`이며 SQLite 연결은 WAL, foreign keys, busy timeout을 설정한다. `DATABASE_URL`이 PostgreSQL URL이면 PostgreSQL wrapper를 사용한다. `src/db/repository.py`는 호환 façade이고, 실제 책임은 trade, strategy, scheduler, market, AI, performance 등 bounded repository로 나뉜다.

주요 테이블 그룹:

- 거래·운영: `trades`, `decision_logs`, `approvals`, `scheduler_results`, `account_snapshots`
- 후보·전략: `scanned_candidates`, `strategy_lookup_runs`, `ai_strategies`, `ai_strategy_events`, `strategy_schedules`, `strategy_universe`
- AI 자동화: `ai_stock_scans`, `ai_stock_candidates`, `ai_stock_execution_plans`, `ai_strategy_positions`, `ai_strategy_decisions`
- 주문·리스크: `ai_managed_orders`, `ai_managed_order_events`, `ai_managed_fills`, `ai_risk_reservations`, `ai_position_protections`
- 시장·성과: `daily_charts`, market snapshots, portfolio snapshots, daily equity, performance tables

`init_db()`는 migration과 각 schema initializer를 순서대로 호출하고 누락 컬럼을 보완한다. 런타임 산출물은 `.runtime/`, `logs/`, `data/`에만 생성한다.

## 7. 운영 및 배포

Windows 개발 환경은 `tools/server.ps1`이 서버 시작·중지·상태·로그를 관리하고 `scripts/local/server.cmd`가 진입점을 제공한다. Linux VM은 다음 구성이다.

- `scripts/vm/hanstock-svc.service`: systemd에서 FastAPI 상시 실행
- `scripts/vm/strategy-dispatch.sh`: DB 기반 전략 디스패처
- `scripts/vm/install-strategy-dispatch-cron.sh`: 전략 디스패처 cron 설치
- `scripts/vm/install-market-regime-preflight-cron.sh`: 시장국면 사전점검 cron 설치
- `scripts/local/deploy-vm.ps1` 및 `scripts/vm/update.sh`: Git fast-forward, 의존성 설치, 격리 검증, 서비스 재시작, smoke test

배포 전제는 Python 3.10 이상, `.env` 존재, `constraints-deploy.txt`를 이용한 의존성 설치다. VM 소스는 직접 수정하지 않고 로컬 브랜치에서 검증 후 배포한다.

## 8. 테스트와 검증

테스트는 `unittest`로 작성되어 있으며 네트워크 guard가 외부 호출을 차단하고 Kiwoom·Slack·AI 호출을 주입/모킹하는 구조다. 특히 다음 계약이 강하게 보호된다.

- trader/risk/order router 및 주문 상태
- 승인 분류·중복·재시도·취소
- AI 전략 lifecycle, planner, risk reservation, autonomy recovery
- 대시보드 route/frontend contract와 설정 schema
- DB migration, runtime persistence, instance isolation
- market regime, calendar, broker adapter normalization

권장 검증 명령:

```powershell
powershell -ExecutionPolicy Bypass -File tools\verify-local.ps1
python -m unittest discover -s tests -t .
powershell -ExecutionPolicy Bypass -File tools\check-encoding.ps1
```

## 9. 유지보수 시 주의점과 개선 후보

1. `src/dashboard/core.py`가 매우 큰 조정 모듈이며, 일부 route·service가 별도 파일로 분리되어도 호환 export를 위해 core와 `dashboard.__init__`의 import 관계를 함께 확인해야 한다.
2. 구형 `trader` 실행 경로와 최신 `application/orders`·`strategy/autonomy` 경로가 공존한다. 주문 관련 변경은 어느 경로가 호출하는지와 strategy attribution을 먼저 확인해야 한다.
3. DB schema가 여러 repository initializer에 분산되어 있다. 새 컬럼이나 테이블은 담당 repository와 migration, PostgreSQL 호환성을 함께 수정해야 한다.
4. `.env` 런타임 변경은 설정 객체·레거시 alias·대시보드 표시값의 정합성을 요구한다. `temporary_settings`, `settings_snapshot`, `trading_flags` 사용 패턴을 유지해야 한다.
5. 실거래 전에는 `dry_run=false`보다 먼저 데모 주문, 승인 큐, 주문 이력 sync, reconciliation, kill switch, daily loss halt를 각각 검증해야 한다.
6. 현재 작업 트리에는 문서와 무관한 기존 수정 파일이 있다. 이번 분석에서는 해당 변경을 해석하거나 되돌리지 않았다.

## 10. 파일별 빠른 참조

| 목적 | 시작 파일 |
|---|---|
| 설정·주문 가능 여부 | `src/config.py`, `src/trader.py` |
| FastAPI 앱 구성 | `src/dashboard/core.py`, `src/dashboard/__init__.py` |
| 계좌·주문 브로커 계약 | `src/broker/base.py`, `src/broker/kiwoom_adapter.py`, `src/broker/factory.py` |
| 일반 스케줄 실행 | `src/scheduler.py`, `src/strategy_scheduler.py` |
| 자율전략 실행 | `src/strategy/autonomy/orchestrator.py`, `src/autonomy_service.py` |
| 주문 원장·복구 | `src/application/orders/`, `src/strategy/autonomy/order_state.py` |
| DB 초기화 | `src/db/repository.py`, `src/db/migrations.py`, `src/db/ai_schema_repository.py` |
| VM 운영 | `scripts/vm/update.sh`, `scripts/vm/server.sh`, `scripts/vm/hanstock-svc.service` |
| 검증 | `tools/verify-local.ps1`, `tools/deployment-smoke.py`, `tests/` |

## 11. 2026-09-03 재분석 결과

### 규모 현황

런타임 산출물과 Python 캐시는 제외한 현재 규모는 다음과 같다.

| 영역 | 파일 수 | 소스 라인 수(대략) |
|---|---:|---:|
| `src/` | 273 | 44,078 |
| `tests/` | 102 | 15,722 |
| `web/` | 8 | 15,614 |
| `scripts/`·`tools/` | 13 | 974 |
| `config/` | 3 | 25,312 |

가장 큰 비코드 데이터는 `config/kr_stock_metadata.json` 25,199줄이다. 이는 종목 메타데이터이므로 코드 분리 대상이 아니다.

### 핵심 대형 파일의 현재 상태

| 파일 | 라인 수 | 판단 |
|---|---:|---|
| `web/static/js/app.js` | 7,239 | 화면 기능별 JS 모듈 분리 우선 |
| `web/static/css/style.css` | 4,096 | 공통/주문/성과/반응형 CSS 분리 가능 |
| `web/templates/index.html` | 3,235 | 탭·컴포넌트 템플릿 분리 검토 |
| `src/dashboard/core.py` | 2,853 | 캐시·계좌·후보·성과·스케줄 조정 책임이 집중됨 |
| `src/dashboard/routes/stock_order.py` | 2,483 | 주문·승인·동기화·거래이력 라우트가 집중됨 |
| `src/strategy/seven_split.py` | 1,760 | 스캔·신호·주문·포트폴리오 계산 분리 가능 |
| `src/trader.py` | 1,244 | 실행 진입점과 계획 계산을 분리할 수 있음 |

### 이미 적용된 분리

대시보드 라우트는 `stock_analysis`, `stock_performance`, `stock_plan`, `stock_order`로 이미 분리되어 있다. DB도 AI scan/execution/risk, strategy, scheduler, trade, performance repository로 나뉜다. 자율전략은 `strategy/autonomy` 아래에 lifecycle, risk, order state, recovery, protection 경계를 갖는다.

최근에는 `src/dashboard/services/cache_policy.py`를 추가해 캐시 timestamp·freshness 계산을 `dashboard/core.py`에서 분리했다. 또한 `src/dashboard/services/order_reconciliation.py`를 추가해 전략별 보유수량 집계와 브로커 잔고 조정 배분 계산을 `stock_order.py`에서 분리했다. `src/dashboard/services/performance_metrics.py`에는 기간 버킷과 시장지표 정규화·일/월 컨텍스트 계산을 이동했다. `src/dashboard/services/account_service.py`에는 계좌 잔고 조회의 캐시·타임아웃·stale fallback·자산 스냅샷 기록을 이동했다. 기존 `core`·`stock_order`의 호환 함수는 유지하여 테스트와 외부 호출 계약을 보호한다.

`src/strategy/momentum_metrics.py`에는 seven-split의 순수 기간수익률·상대 모멘텀·변동성 계산을 이동했고, `src/strategy/profile_service.py`에는 공통 기술지표 bundle 생성을, `src/strategy/universe_service.py`에는 조건 모니터·거래량·정적 풀을 조합하는 스캔 유니버스 구성을, `portfolio_service.py`에는 점수·역변동성 기반 목표비중과 리밸런싱 수량 계산을, `allocation_service.py`에는 PPO/heuristic 목표비중과 UI reasoning 계산을, `scoring_service.py`에는 기본 기술지표 점수 정책을 이동했다. `web/static/js/dashboard-api.js`, `dashboard-formatters.js`, `dashboard-ui.js`에는 대시보드 공통 HTTP·표현·DOM 헬퍼를 분리했다. 또한 `dashboard-market-regime.js`에는 시장국면 라벨·가이드·순수 포맷 함수를, `dashboard-strategy-audit.js`에는 전략 운영상태·이벤트 요약·실행시각 포맷 함수를 이동했다. 기존 `app.js`는 현재 fallback 구현과 alias를 유지하여 페이지 로딩 순서 변경에도 호환된다.

### 남은 구조적 문제

1. `dashboard.core`가 서비스 호출 조정자와 과거 호환 API를 동시에 맡는다.
2. 라우트 모듈이 `from src.dashboard.core import *`와 `_refresh_legacy_dependencies()`에 의존한다. 바로 import를 끊으면 테스트·라우트 등록이 깨질 수 있다.
3. `src.db.repository`는 여러 bounded repository를 재수출하는 façade라서 사용처가 많다. 직접 import를 일괄 변경하기보다 새 코드부터 담당 repository를 직접 사용해야 한다.
4. 구형 승인/거래 경로와 통합 주문 원장이 함께 존재한다. `legacy_bridge.py`와 reconciliation을 제거하기 전에는 데이터 마이그레이션과 운영 이력 검증이 필요하다.
5. 테스트 실행 시 `__pycache__`가 재생성된다. 이는 삭제 대상이 아니라 `.gitignore`로 관리되는 재생성 산출물이다.

### 권장 리팩터링 순서

```text
cache policy (완료)
  → dashboard common API / formatters / UI / market regime (진행 중)
  → dashboard account/cache facade (완료)
  → stock_order approval / order-sync / trade-history
  → dashboard performance calculations
  → seven_split profile / universe / scoring / momentum / portfolio / allocation metrics (진행 중)
  → seven_split scan / signal / order planning
  → trader runtime orchestration
  → app.js feature modules
```

각 단계는 새 모듈을 먼저 만들고 기존 함수는 compatibility wrapper로 남긴 뒤, route contract와 전체 unittest를 통과시키고 사용처를 점진적으로 변경하는 방식이 안전하다. 목표 라인 수는 500줄을 참고값으로 사용하되, 하나의 업무 책임을 보존하는 것을 우선한다.

### 프론트엔드 분리 설계

`app.js`는 비모듈 전역 스크립트이므로 다음 순서로 분리한다.

1. `dashboard-api.js`: `fetchJson`, `postJson`, `deleteJson`와 공통 HTTP 오류 처리
2. `dashboard-formatters.js`: 금액·수량·수익률·HTML escape·상태 label
3. `dashboard-state.js`: watchlist/holdings/strategy/scheduler 상태
4. `dashboard-performance.js`: 성과·차트·시장국면 화면
5. `dashboard-strategies.js`: AI 전략·후보·watchlist 화면
6. `dashboard-orders.js`: 승인·주문·거래 동기화 화면

각 파일은 기존 non-module 페이지와 호환되도록 필요한 공개 함수만 `window.HanstockDashboard` namespace에 등록하고, `app.js`는 단계적으로 그 namespace를 사용한다. HTML의 script 순서는 API → formatters → state → feature modules → legacy bridge 순서로 고정한다. 기능 이동 후 기존 전역 함수는 한 릴리스 동안 wrapper로 유지하고, `test_common_dashboard_frontend_contract.py`의 selector·API 계약을 통과시킨 뒤 제거한다.

# Hanstock

나무 REST API 기반 국내주식 자동매매와 AI 전략 운영 대시보드를 제공하는
독립 Python/FastAPI 서비스입니다. 기존 Hanstock/Mistock의 DB, 스케줄, 환경설정과
운영 디렉터리를 공유하지 않습니다.

대시보드 상단에는 `환경설정`, `새로고침`만 두고, 기능 메뉴는 `개요`, `보유종목`,
`관심종목`, `AI전략`, `시장국면`, `스케줄`, `최적화`, `성과`로 제한합니다.

## 빠른 실행

아래 `scripts/local/`, `scripts/vm/`, `tools/` 경로가 공식 진입점입니다.

로컬 Windows:

```powershell
.\scripts\local\server.cmd restart
```

VM/Linux:

```bash
./scripts/vm/server.sh restart
```

## 자동 배포

기본 배포 디렉터리는 `/home/ubuntu/hanstock_svc`, 저장소는
`https://github.com/turtler501m-ai/hanstock_svc`입니다. 서비스는 다른 Hanstock
인스턴스와 충돌하지 않도록 `127.0.0.1:8011`에 바인딩합니다.

```powershell
.\scripts\local\deploy-vm.ps1
```

VM 폴더를 백업하고 새로 clone해서 현행화:

```powershell
.\scripts\local\deploy-vm.ps1 -FreshClone
```

## 배포 의존성

운영 배포에서는 검증된 정확한 버전이 기록된 constraints 파일을 함께 사용합니다.

```powershell
pip install -c constraints-deploy.txt -r requirements.txt
```

`requirements-*.txt`는 지원 버전 범위를, `constraints-deploy.txt`는 배포에 사용하는
직접 의존성의 정확한 버전을 나타냅니다. 현재 저장소는 해시 기반 lock 파일을
제공하지 않으므로 `--require-hashes`를 사용하지 않습니다.

## 검증

```powershell
powershell -ExecutionPolicy Bypass -File tools\verify-local.ps1
python -m unittest discover -s tests -t .
```

실행 상태는 프로젝트 내부의 `.runtime/`, `logs/`, `data/`에만 생성됩니다.

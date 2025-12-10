# Firebase 규칙 설정 가이드

## 📋 개요

이 프로젝트는 Firebase Firestore Database와 Storage를 사용합니다. 보안을 위해 적절한 규칙을 설정해야 합니다.

## 🔐 관리자 UID 확인 방법

1. Firebase Console에 로그인
2. Authentication → Users 메뉴로 이동
3. 관리자로 지정할 사용자의 UID를 복사
4. 아래 규칙 파일에 UID를 입력

## 📝 Firestore 규칙 설정

### 1. Firebase Console에서 설정

1. Firebase Console → Firestore Database → Rules 탭으로 이동
2. `firestore.rules` 파일의 내용을 복사하여 붙여넣기
3. **중요**: `YOUR_ADMIN_UID_1`, `YOUR_ADMIN_UID_2` 부분을 실제 관리자 UID로 변경
   ```javascript
   // 예시
   request.auth.uid in ['abc123def456', 'xyz789uvw012']
   ```
4. "Publish" 버튼 클릭

### 2. 규칙 설명

- **users 컬렉션**: 사용자 기본 정보
  - 읽기/쓰기: 자신의 데이터 또는 관리자
  - 삭제: 관리자만

- **userRecords 컬렉션**: 사용자 신체 정보
  - 읽기/쓰기: 자신의 데이터 또는 관리자
  - 삭제: 관리자만
  - **dailyRecords 서브컬렉션**: 날짜별 신체 기록 (동일한 규칙 적용)

- **foodRecords 컬렉션**: 음식 기록
  - 읽기: 자신의 데이터 (userId 필드 확인) 또는 관리자
  - 쓰기: 자신의 데이터만 (userId 필드가 자신의 UID와 일치) 또는 관리자
  - 삭제: 관리자만

## 🗄️ Storage 규칙 설정

### 1. Firebase Console에서 설정

1. Firebase Console → Storage → Rules 탭으로 이동
2. `storage.rules` 파일의 내용을 복사하여 붙여넣기
3. **중요**: `YOUR_ADMIN_UID_1`, `YOUR_ADMIN_UID_2` 부분을 실제 관리자 UID로 변경
   ```javascript
   // 예시
   request.auth.uid in ['abc123def456', 'xyz789uvw012']
   ```
4. "Publish" 버튼 클릭

### 2. 규칙 설명

- **users/{userId}/** 경로: 사용자별 이미지 및 파일
  - 읽기/쓰기: 자신의 데이터 또는 관리자
  - 삭제: 관리자만

- **images/{userId}/** 경로: 사용자별 이미지 (대체 경로)
  - 읽기/쓰기: 자신의 데이터 또는 관리자
  - 삭제: 관리자만

- **chatImages/{userId}/** 경로: 챗봇 대화 관련 이미지
  - 읽기/쓰기: 자신의 데이터 또는 관리자
  - 삭제: 관리자만

## ⚠️ 주의사항

1. **관리자 UID는 반드시 실제 UID로 변경해야 합니다**
2. **규칙 변경 후 반드시 테스트를 진행하세요**
3. **프로덕션 환경에서는 더 엄격한 규칙을 적용하는 것을 권장합니다**
4. **관리자 UID는 안전하게 관리하세요**

## 🧪 규칙 테스트

Firebase Console의 Rules 탭에서 "Rules Playground"를 사용하여 규칙을 테스트할 수 있습니다.

### 테스트 시나리오 예시

1. **일반 사용자 자신의 데이터 읽기**: ✅ 허용되어야 함
2. **일반 사용자 다른 사용자의 데이터 읽기**: ❌ 거부되어야 함
3. **관리자가 모든 데이터 읽기**: ✅ 허용되어야 함
4. **일반 사용자가 자신의 데이터 쓰기**: ✅ 허용되어야 함
5. **일반 사용자가 다른 사용자의 데이터 쓰기**: ❌ 거부되어야 함
6. **관리자가 데이터 삭제**: ✅ 허용되어야 함
7. **일반 사용자가 데이터 삭제**: ❌ 거부되어야 함


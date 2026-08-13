/**
 * 같은 작업 키에 대해 아직 끝나지 않은 Promise를 하나만 유지합니다.
 *
 * 추천 경로는 외부 길찾기 API와 Branch-and-Bound 탐색을 함께 수행하므로 시간이 걸립니다.
 * 브라우저 새로고침, React StrictMode의 개발용 Effect 재실행, 재시도 요청이 겹쳐도
 * 같은 여행 계획을 여러 번 계산·삭제·저장하지 않도록 서버에서 결과 Promise를 공유합니다.
 * 이 저장소는 단일 Node 프로세스용 메모리 보호 장치입니다. 서버를 여러 대로 확장할 때는
 * Redis나 DB의 Recommendation Run 상태로 같은 원칙을 분산 환경까지 확장해야 합니다.
 */
const inFlightJobs = new Map()

export async function runSingleFlight({ key, job }) {
  if (!key) throw new TypeError("작업 키가 필요합니다.")
  if (typeof job !== "function") throw new TypeError("실행할 작업 함수가 필요합니다.")

  const existingJob = inFlightJobs.get(key)
  if (existingJob) {
    return {
      result: await existingJob,
      // 호출자는 공유된 실행인지 알 수 있지만, 결과 내용은 최초 요청과 완전히 같습니다.
      wasShared: true,
    }
  }

  // Promise.resolve().then(...)으로 감싸 동기 예외도 Promise 실패로 통일합니다.
  const runningJob = Promise.resolve().then(job)
  inFlightJobs.set(key, runningJob)

  try {
    return {
      result: await runningJob,
      wasShared: false,
    }
  } finally {
    // 실패·성공 어느 경우든 다음 사용자의 새 추천은 가능해야 합니다.
    // 아직 같은 Promise가 등록돼 있을 때만 지워 안전하게 정리합니다.
    if (inFlightJobs.get(key) === runningJob) inFlightJobs.delete(key)
  }
}

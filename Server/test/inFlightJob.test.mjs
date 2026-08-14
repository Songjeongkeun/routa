import assert from "node:assert/strict"
import test from "node:test"
import { runSingleFlight } from "../src/utils/inFlightJob.mjs"

test("같은 키의 동시 작업은 한 번만 실행하고 결과를 공유한다", async () => {
  let executions = 0
  let releaseJob
  const jobFinished = new Promise((resolve) => { releaseJob = resolve })
  const job = async () => {
    executions += 1
    await jobFinished
    return "recommendation-result"
  }

  const firstRequest = runSingleFlight({ key: "user-1:plan-1", job })
  const secondRequest = runSingleFlight({ key: "user-1:plan-1", job })
  releaseJob()

  const [first, second] = await Promise.all([firstRequest, secondRequest])
  assert.equal(executions, 1)
  assert.equal(first.result, "recommendation-result")
  assert.equal(second.result, "recommendation-result")
  assert.equal(first.wasShared || second.wasShared, true)
})

test("끝난 작업은 같은 키라도 새로 실행할 수 있다", async () => {
  let executions = 0
  const job = async () => ++executions

  await runSingleFlight({ key: "user-1:plan-2", job })
  await runSingleFlight({ key: "user-1:plan-2", job })

  assert.equal(executions, 2)
})

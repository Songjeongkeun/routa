import { currentTime } from "./date.mjs"

export function logger(source, message) {
  console.log(`[${currentTime()}] [${source}] ${message}`)
}

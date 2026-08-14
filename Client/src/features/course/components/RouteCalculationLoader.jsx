import "./RouteCalculationLoader.css"

/**
 * 변경: 최초 추천 계산과 일정 편집 후 재계산이 같은 시각 언어를 사용하도록 공통 로딩 UI를 제공합니다.
 * 서버가 실제 퍼센트 진행률을 보내지 않으므로, 완료율을 꾸며내는 대신 반복 진행 바로 처리 중임을 명확히 표시합니다.
 */
export default function RouteCalculationLoader({
  variant = "page",
  title,
  description,
  detail,
}) {
  const Heading = variant === "page" ? "h1" : "h2"

  const card = (
    <section className="route-calculation-loader__card">
      <span className="route-calculation-loader__icon" aria-hidden="true">✦</span>
      <p className="route-calculation-loader__eyebrow">ROUTA 경로 계산</p>
      <Heading>{title}</Heading>
      <p className="route-calculation-loader__description">{description}</p>
      <div className="route-calculation-loader__progress" aria-hidden="true">
        <span />
      </div>
      {detail && <small>{detail}</small>}
    </section>
  )

  if (variant === "overlay") {
    // 변경: 수정 중에는 현재 지도와 시간표를 유지한 채 같은 로딩 카드를 오버레이로 보여 줍니다.
    return (
      <div className="route-calculation-loader route-calculation-loader--overlay" role="status" aria-live="assertive" aria-atomic="true">
        {card}
      </div>
    )
  }

  return (
    <main className="route-calculation-loader route-calculation-loader--page" aria-live="polite" aria-busy="true">
      {card}
    </main>
  )
}

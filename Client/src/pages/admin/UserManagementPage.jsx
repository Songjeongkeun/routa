import { useNavigate } from "react-router-dom"
import styles from "./UserManagementPage.module.css"

// TODO: GET /admin/users/stats, GET /admin/users 연동 후 이 값들을 API 응답으로 채우기
const STATS = { totalUsers: null, newUsersToday: null, activeUsers: null }
const MONTHLY_TREND = []
const USERS = []

const CHART_MAX = 1200
const CHART_TICKS = [1200, 800, 400, 0]
const STATUS_LABEL = { ACTIVE: "활성", SUSPENDED: "휴면", WITHDRAWN: "탈퇴" }
const STATUS_CLASS = { ACTIVE: "statusActive", SUSPENDED: "statusDormant", WITHDRAWN: "statusWithdrawn" }

function PeopleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 8.5a3 3 0 1 1 0-6" />
      <path d="M15 14.2c2.5.5 4.5 2.6 5 6" />
    </svg>
  )
}

function PlusCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

function ActivityIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2.5 7L14 4l2 8h5" />
    </svg>
  )
}

function GroupIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8.5" cy="8" r="3" />
      <path d="M2.5 19c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" />
      <circle cx="16.5" cy="8.5" r="2.4" />
      <path d="M15 13.6c2.3.5 4 2.4 4.4 5.4" />
    </svg>
  )
}

export default function UserManagementPage() {
  const navigate = useNavigate()

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1>유저 관리</h1>
          <p>전체 유저 수, 신규 가입자, 활성 상태를 한눈에 확인하고 관리해요.</p>
        </div>
        <button type="button" className={styles.inquiryButton} onClick={() => navigate("/admin/inquiries")}>
          문의 관리 →
        </button>
      </div>

      <section className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={`${styles.statIcon} ${styles.iconPurple}`}><PeopleIcon /></span>
          <div className={styles.statText}>
            <span className={styles.statLabel}>전체 유저 수</span>
            <strong className={styles.statValue}>{STATS.totalUsers ?? "-"}</strong>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={`${styles.statIcon} ${styles.iconGreen}`}><PlusCircleIcon /></span>
          <div className={styles.statText}>
            <span className={styles.statLabel}>신규 가입 (오늘)</span>
            <strong className={styles.statValue}>{STATS.newUsersToday ?? "-"}</strong>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={`${styles.statIcon} ${styles.iconBlue}`}><ActivityIcon /></span>
          <div className={styles.statText}>
            <span className={styles.statLabel}>활성 유저 수</span>
            <strong className={styles.statValue}>{STATS.activeUsers ?? "-"}</strong>
          </div>
        </div>
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.chartCard}>
          <h2>월별 누적 유저 추이</h2>
          <div className={styles.chartArea}>
            <div className={styles.axis}>
              {CHART_TICKS.map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
            <div className={styles.bars}>
              {MONTHLY_TREND.length === 0 ? (
                <p className={styles.emptyState}>데이터가 없어요.</p>
              ) : (
                MONTHLY_TREND.map(({ month, value }) => (
                  <div key={month} className={styles.barColumn}>
                    <span className={styles.barValue}>{value}</span>
                    <div className={styles.barTrack}>
                      <div className={styles.bar} style={{ height: `${(value / CHART_MAX) * 100}%` }} />
                    </div>
                    <span className={styles.barLabel}>{month}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className={styles.listCard}>
          <h2><GroupIcon /> 유저 목록</h2>
          <div className={styles.tableWrap}>
            <table className={styles.userTable}>
              <thead>
                <tr>
                  <th>이름</th>
                  <th>이메일</th>
                  <th>가입일</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {USERS.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.emptyState}>데이터가 없어요.</td>
                  </tr>
                ) : (
                  USERS.map((user) => (
                    <tr key={user.email}>
                      <td className={styles.nameCell}>{user.name}</td>
                      <td className={styles.emailCell}>{user.email}</td>
                      <td className={styles.dateCell}>{user.joinedAt}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[STATUS_CLASS[user.status]]}`}>
                          {STATUS_LABEL[user.status]}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
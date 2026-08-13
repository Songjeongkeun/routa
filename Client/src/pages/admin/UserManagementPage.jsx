import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { getUserStats, getUsers, collectPlaces } from "../../features/admin/admin.api.js"
import totalUsersIcon from "../../shared/assets/icons/Total-users.png"
import newRegistrationIcon from "../../shared/assets/icons/New-registration-today.png"
import activeUsersIcon from "../../shared/assets/icons/Active -users.png"
import usersIcon from "../../shared/assets/icons/users.png"
import styles from "./UserManagementPage.module.css"

const STATUS_LABEL = { ACTIVE: "활성", DORMANT: "휴면", WITHDRAWN: "탈퇴" }
const STATUS_CLASS = { ACTIVE: "statusActive", DORMANT: "statusDormant", WITHDRAWN: "statusWithdrawn" }

export default function UserManagementPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [page, setPage] = useState(1)
  const [loadError, setLoadError] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [totalFiltered, setTotalFiltered] = useState(0)

  useEffect(() => {
    let active = true
    getUserStats()
      .then((data) => { if (active) setStats(data) })
      .catch((error) => { if (active) setLoadError(error.message) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    getUsers({ page, pageSize: 5, status: statusFilter })
      .then((data) => { if (active) setUsers(data.users); setTotalFiltered(data.total) })
      .catch((error) => { if (active) setLoadError(error.message) })
    return () => { active = false }
  }, [page, statusFilter])

  /** 필터 바뀌면 1페이지로 돌아가는 핸들러 추가 */
  function handleStatusFilterChange(e) {
    setStatusFilter(e.target.value)
    setPage(1)
}

  if (loadError) return <main className={styles.page}>{loadError}</main>
  if (!stats) return <main className={styles.page}>불러오는 중...</main>

  const maxValue = stats.monthlyTrend.length > 0
    ? Math.max(...stats.monthlyTrend.map((item) => item.value))
    : 0
  const chartMax = Math.max(20, Math.ceil(maxValue / 100) * 20)
  const chartTicks = [chartMax, Math.round((chartMax * 2) / 3), Math.round(chartMax / 3), 0]

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1>유저 관리</h1>
          <p>전체 유저 수, 신규 가입자, 활성 상태를 한눈에 확인하고 관리해요.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className={styles.collectButton} onClick={handleCollectPlaces} disabled={isCollecting}>
            {isCollecting ? "요청 중..." : "장소 데이터 수집"}
          </button>
          <button type="button" className={styles.inquiryButton} onClick={() => navigate("/admin/inquiries")}>
            문의 관리 →
          </button>
        </div>
      </div>

      <section className={styles.statsRow}>
        <div className={styles.statCard}>
          <img className={styles.statIcon} src={totalUsersIcon} alt="" />
          <div className={styles.statText}>
            <span className={styles.statLabel}>전체 유저 수</span>
            <strong className={styles.statValue}>{stats.totalUsers.toLocaleString()}</strong>
          </div>
        </div>
        <div className={styles.statCard}>
          <img className={styles.statIcon} src={newRegistrationIcon} alt="" />
          <div className={styles.statText}>
            <span className={styles.statLabel}>신규 가입 (오늘)</span>
            <strong className={styles.statValue}>{stats.newUsersToday}</strong>
          </div>
        </div>
        <div className={styles.statCard}>
          <img className={styles.statIcon} src={activeUsersIcon} alt="" />
          <div className={styles.statText}>
            <span className={styles.statLabel}>활성 유저 수</span>
            <strong className={styles.statValue}>{stats.activeUsers.toLocaleString()}</strong>
          </div>
        </div>
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.chartCard}>
          <h2>월별 누적 유저 추이</h2>
          <div className={styles.chartArea}>
            <div className={styles.axis}>
              {chartTicks.map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
            <div className={styles.bars}>
              {stats.monthlyTrend.map(({ month, value }) => (
                <div key={month} className={styles.barColumn}>
                  <span className={styles.barValue}>{value}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.bar} style={{ height: `${(value / chartMax) * 100}%` }} />
                  </div>
                  <span className={styles.barLabel}>{month}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.listCard}>
          <div className={styles.listHeader}>
            <h2><img className={styles.titleIcon} src={usersIcon} alt="" /> 유저 목록</h2>
            <select value={statusFilter} onChange={handleStatusFilterChange}>
              <option value="">모두</option>
              <option value="ACTIVE">활성</option>
              <option value="DORMANT">휴면</option>
              <option value="WITHDRAWN">탈퇴</option>
            </select>
          </div>
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
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.emptyState}>데이터가 없어요.</td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.user_id}>
                      <td className={styles.nameCell}>{user.nickname}</td>
                      <td className={styles.emailCell}>{user.email}</td>
                      <td className={styles.dateCell}>{new Date(user.created_at).toLocaleDateString("ko-KR")}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[STATUS_CLASS[user.account_status]]}`}>
                          {STATUS_LABEL[user.account_status]}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className={styles.pagination}>
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                이전
              </button>
              <span>{page} / {Math.max(1, Math.ceil(totalFiltered / 5))}</span>
              <button
                type="button"
                disabled={page >= Math.ceil(stats.totalUsers / 5)}
                onClick={() => setPage((p) => p + 1)}
              >
                다음
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
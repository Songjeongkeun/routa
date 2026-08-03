import { Outlet } from "react-router-dom"
import authBackground from "../assets/images/auth-background.png"
import styles from "./AuthLayout.module.css"

export default function AuthLayout() {
  return (
    <main className={styles.container}>
      <section className={styles.visual} aria-label="ROUTA 여행 소개 이미지">
        <img src={authBackground} alt="ROUTA" />
      </section>
      <section className={styles.card}>
        <div className={styles.formContainer}>
          <Outlet />
        </div>
      </section>
    </main>
  )
}

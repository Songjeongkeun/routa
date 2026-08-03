import styles from "./FormField.module.css"

export default function FormField({ label, icon, action, ...inputProps }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.inputBox}>
        <img className={styles.icon} src={icon} alt="" aria-hidden="true" />
        <input className={styles.input} {...inputProps} />
        {action}
      </span>
    </label>
  )
}

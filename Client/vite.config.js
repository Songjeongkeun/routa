import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig(({ mode }) => {
  // 변경: HOST_PORT와 FRONTEND_URL만 읽습니다.
  // API 키처럼 브라우저에 노출되면 안 되는 서버 환경변수는 Vite 설정으로 불러오지 않습니다.
  const environment = loadEnv(mode, "..", "HOST_")
  const frontendEnvironment = loadEnv(mode, "..", "FRONTEND_URL")
  const apiPort = Number(environment.HOST_PORT || 18765)
  const frontendHost = (() => {
    try {
      return new URL(frontendEnvironment.FRONTEND_URL).hostname
    } catch {
      return null
    }
  })()

  return {
    plugins: [react()],
    envDir: "..",
    server: {
      // 변경: localhost뿐 아니라 같은 Wi-Fi/LAN에 연결된 기기도 개발 PC의 사설 IP로 접속할 수 있게 합니다.
      // 예: http://192.168.0.10:5173 (macOS 방화벽에서 Node 접근 허용이 필요할 수 있습니다.)
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      // 변경: ngrok 공개 주소의 Host 헤더를 허용합니다.
      // Vite의 기본 보안 정책으로 인해 이 설정이 없으면 ngrok 접속 시
      // "Blocked request. This host is not allowed" 오류가 발생할 수 있습니다.
      // 변경: FRONTEND_URL에서 도메인을 읽으므로 ngrok 주소가 바뀌어도 이 파일을 다시 고칠 필요가 없습니다.
      // FRONTEND_URL이 비어 있거나 잘못된 경우에는 Vite 기본 허용 규칙을 사용합니다.
      // 모든 도메인을 허용하는 true 대신 현재 OAuth 공개 주소 하나만 허용합니다.
      allowedHosts: frontendHost ? [frontendHost] : undefined,
      // 변경: 원격 기기의 localhost는 그 기기 자신을 가리키므로, 브라우저가 Express에 직접 접속하지 않습니다.
      // 모든 /api 요청을 Vite가 같은 개발 PC의 Express 서버로 전달해 LAN IP별 CORS 설정도 피합니다.
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  }
})

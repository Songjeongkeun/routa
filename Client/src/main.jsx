import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router-dom"
import { AuthProvider } from "./app/providers/AuthProvider.jsx"
import { router } from "./app/router/router.jsx"
import { PlanProvider } from "./app/providers/PlanProvider.jsx"
import "./shared/styles/reset.css"
import "./shared/styles/global.css"

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <PlanProvider>
        <RouterProvider router={router} />
      </PlanProvider>
    </AuthProvider>
  </StrictMode>,
)

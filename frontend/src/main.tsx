import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { SyncProvider } from './contexts/SyncContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { OfflineBanner } from './components/OfflineBanner'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { NewVacationPage } from './pages/NewVacationPage'
import { VacationDetailPage } from './pages/VacationDetailPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { Toaster } from './components/ui/toaster'
import { registerSW } from './lib/pwa'
import './index.css'

registerSW()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SyncProvider>
          <BrowserRouter>
            <OfflineBanner />
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vacations/new"
                element={
                  <ProtectedRoute>
                    <NewVacationPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vacations/:id"
                element={
                  <ProtectedRoute>
                    <VacationDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <ProtectedRoute adminOnly>
                    <AdminUsersPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster />
          </BrowserRouter>
        </SyncProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
)

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSync } from '@/contexts/SyncContext'
import { Button } from '@/components/ui/button'
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog'
import { Plane, LogOut, Users, Home, KeyRound } from 'lucide-react'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin } = useAuth()
  const { isOnline, pendingCount } = useSync()
  const navigate = useNavigate()
  const [changePwOpen, setChangePwOpen] = useState(false)
  const bannerVisible = !isOnline || pendingCount > 0

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className={`min-h-screen bg-background${bannerVisible ? ' pt-10' : ''}`}>
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 font-semibold text-lg">
              <Plane className="h-5 w-5" />
              <span>Travel Expense Tracker</span>
            </Link>
            <nav className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <Home className="h-4 w-4" />
                Dashboard
              </Link>
              {isAdmin && (
                <Link to="/admin/users" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <Users className="h-4 w-4" />
                  Users
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {user?.username}
              {isAdmin && <span className="ml-1 text-xs bg-primary text-primary-foreground rounded px-1">Admin</span>}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setChangePwOpen(true)}>
              <KeyRound className="h-4 w-4 mr-1" />
              Password
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      <ChangePasswordDialog open={changePwOpen} onClose={() => setChangePwOpen(false)} />
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}

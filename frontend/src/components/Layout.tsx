import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSync } from '@/contexts/SyncContext'
import { Button } from '@/components/ui/button'
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog'
import { Plane, LogOut, Users, Home, KeyRound, Menu, X, WifiOff, Clock } from 'lucide-react'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin } = useAuth()
  const { isOnline, pendingCount } = useSync()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [changePwOpen, setChangePwOpen] = useState(false)

  const handleLogout = () => {
    setMenuOpen(false)
    logout()
    navigate('/login')
  }

  const handleChangePw = () => {
    setMenuOpen(false)
    setChangePwOpen(true)
  }

  const closeMenu = () => setMenuOpen(false)

  const navLinks = [
    { to: '/', label: 'Dashboard', icon: <Home className="h-4 w-4" /> },
    ...(isAdmin ? [{ to: '/admin/users', label: 'Users', icon: <Users className="h-4 w-4" /> }] : []),
  ]

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  return (
    <div className="min-h-screen bg-background">
      {/* Offline / pending banner */}
      {(!isOnline || pendingCount > 0) && (
        <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium
          bg-amber-50 border-b border-amber-200 text-amber-800">
          {!isOnline
            ? <><WifiOff className="h-3 w-3" /> Offline — changes will sync when you reconnect</>
            : <><Clock className="h-3 w-3" /> {pendingCount} change{pendingCount !== 1 ? 's' : ''} pending sync</>
          }
        </div>
      )}

      <header className={`sticky z-40 border-b bg-background${!isOnline || pendingCount > 0 ? ' top-7' : ' top-0'}`}>
        <div className="container mx-auto flex h-14 items-center justify-between px-4">

          {/* Logo */}
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 font-semibold text-lg" onClick={closeMenu}>
              <Plane className="h-5 w-5 shrink-0" />
              <span className="hidden md:inline">Travel Expense Tracker</span>
              <span className="md:hidden">TET</span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-4">
              {navLinks.map(({ to, label, icon }) => (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-1 text-sm transition-colors
                    ${isActive(to) ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {icon}
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Desktop right side */}
          <div className="hidden md:flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {user?.username}
              {isAdmin && (
                <span className="ml-1 text-xs bg-primary text-primary-foreground rounded px-1">Admin</span>
              )}
            </span>
            <Button variant="ghost" size="sm" onClick={handleChangePw}>
              <KeyRound className="h-4 w-4 mr-1" />
              Password
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" />
              Logout
            </Button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={() => setMenuOpen(v => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t bg-background">
            <div className="container mx-auto px-4 py-3 space-y-1">
              {/* Username */}
              <div className="px-3 py-2 text-sm font-medium text-foreground border-b mb-2">
                {user?.username}
                {isAdmin && (
                  <span className="ml-2 text-xs bg-primary text-primary-foreground rounded px-1">Admin</span>
                )}
              </div>

              {/* Nav links */}
              {navLinks.map(({ to, label, icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={closeMenu}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors
                    ${isActive(to)
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
                >
                  {icon}
                  {label}
                </Link>
              ))}

              {/* Actions */}
              <button
                onClick={handleChangePw}
                className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <KeyRound className="h-4 w-4" />
                Change Password
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        )}
      </header>

      <ChangePasswordDialog open={changePwOpen} onClose={() => setChangePwOpen(false)} />

      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}

import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { useSession } from './lib/session'
import { useI18n } from './lib/i18n'
import Login, { NewPassword } from './pages/Login'
import Onboarding, { Pending } from './pages/Onboarding'
import Shopping from './pages/Shopping'
import Calendar from './pages/Calendar'
import Board from './pages/Board'
import HallPage from './pages/Hall'
import Me from './pages/Me'
import Admin from './pages/Admin'
import Welcome, { hasSeenWelcome } from './pages/Welcome'
import HelpCenter from './pages/Help'
import { useState } from 'react'

const icons: Record<string, string> = {
  shopping: 'M4 5h2l2.2 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20 8H7 M10 20h.01 M17 20h.01',
  calendar: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M4 10h16 M8 3v4 M16 3v4',
  board: 'M5 4h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-7l-4 3v-3H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M8 9h8 M8 12h5',
  hall: 'M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-5h4v5',
  me: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  admin: 'M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7z M9 12l2 2 4-4'
}

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  )
}

function TabBar() {
  const { t } = useI18n()
  const { isSuperadmin, adminDorms, membership } = useSession()
  const resident = !!membership && membership.dorm.status === 'approved'
  const tabs = [
    ...(resident ? [
      { to: '/', key: 'shopping' },
      { to: '/kalender', key: 'calendar' },
      { to: '/opslag', key: 'board' },
      { to: '/gang', key: 'hall' }
    ] : []),
    ...(isSuperadmin || adminDorms.length ? [{ to: '/admin', key: 'admin' }] : []),
    { to: '/mig', key: 'me' }
  ]
  return (
    <div className="tabbar">
      <nav>
        {tabs.map((tab) => (
          <NavLink key={tab.key} to={tab.to} end className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={tab.key} />
            {t('nav.' + tab.key)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  const { ready, session, membership, isSuperadmin, adminDorms, recovering } = useSession()
  const { t } = useI18n()
  const [, rerender] = useState(0)

  if (!ready) return <div className="center-screen muted">{t('common.loading')}</div>
  if (recovering) return <NewPassword />
  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }
  // Administration uden egen gang får kun admin-siden og Mig.
  if (!membership && adminDorms.length > 0) {
    return (
      <div className="app">
        <Routes>
          <Route path="/admin" element={<Admin />} />
          <Route path="/mig" element={<Me />} />
          <Route path="/hjaelp" element={<HelpCenter />} />
          <Route path="/join/:code" element={<Onboarding />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
        <TabBar />
      </div>
    )
  }
  if (!membership) {
    return (
      <Routes>
        {isSuperadmin && <Route path="/admin" element={<Admin standalone />} />}
        <Route path="/join/:code" element={<Onboarding />} />
        <Route path="/hjaelp" element={<div className="app"><HelpCenter /></div>} />
        <Route path="*" element={<Onboarding />} />
      </Routes>
    )
  }
  if (membership.dorm.status !== 'approved') {
    return (
      <Routes>
        {isSuperadmin && <Route path="/admin" element={<Admin standalone />} />}
        <Route path="*" element={<Pending />} />
      </Routes>
    )
  }

  if (!hasSeenWelcome(session.user.id) || window.location.hash === '#/velkommen') {
    return <Welcome onDone={() => rerender((n) => n + 1)} />
  }

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Shopping />} />
        <Route path="/kalender" element={<Calendar />} />
        <Route path="/opslag" element={<Board />} />
        <Route path="/gang" element={<HallPage />} />
        <Route path="/mig" element={<Me />} />
        <Route path="/hjaelp" element={<HelpCenter />} />
        {(isSuperadmin || adminDorms.length > 0) && <Route path="/admin" element={<Admin />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </div>
  )
}

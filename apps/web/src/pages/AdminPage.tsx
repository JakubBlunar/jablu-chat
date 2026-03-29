import { useState } from 'react'
import { getStoredToken } from './admin/adminApi'
import { AdminLogin } from './admin/AdminLogin'
import { AdminDashboard } from './admin/AdminDashboard'

export function AdminPage() {
  const [authed, setAuthed] = useState(!!getStoredToken())

  if (!authed) {
    return <AdminLogin onLogin={() => setAuthed(true)} />
  }

  return <AdminDashboard />
}

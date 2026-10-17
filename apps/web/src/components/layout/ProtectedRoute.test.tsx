import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuthStore } from '@/stores/auth.store'

function LoginTarget() {
  const location = useLocation()
  return <div data-testid="return-target">{location.state?.from}</div>
}

it('retains the full notification target when login is required', () => {
  useAuthStore.setState({ isAuthenticated: false, isLoading: false })
  render(
    <MemoryRouter initialEntries={['/channels/s1/ch1?m=reply&thread=parent']}>
      <Routes>
        <Route path="/login" element={<LoginTarget />} />
        <Route path="*" element={<ProtectedRoute><div>Chat</div></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>
  )
  expect(screen.getByTestId('return-target').textContent).toBe('/channels/s1/ch1?m=reply&thread=parent')
})

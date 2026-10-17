import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { LoginPage } from './LoginPage'
import { useAuthStore } from '@/stores/auth.store'
import type { ReactNode } from 'react'

jest.mock('@/components/layout/AuthLayout', () => ({
  AuthLayout: ({ children }: { children: ReactNode }) => children
}))

function Destination() {
  const location = useLocation()
  return <div data-testid="destination">{location.pathname}{location.search}</div>
}

it.each([
  ['/channels/s1/ch1?m=reply&thread=parent', '/channels/s1/ch1?m=reply&thread=parent'],
  ['https://other.test', '/']
])('returns authenticated users to a safe target: %s', (from, expected) => {
  useAuthStore.setState({ isAuthenticated: true, isLoading: false })
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: { from } }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Destination />} />
      </Routes>
    </MemoryRouter>
  )
  expect(screen.getByTestId('destination').textContent).toBe(expected)
})

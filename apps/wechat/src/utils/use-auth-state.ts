import { useEffect, useState } from 'react'
import type { AuthState } from '../services/auth-contracts'
import type { AuthService } from '../services/auth-service'

/** Every auth transition invalidates mounted private view state. */
export function useAuthState(service: AuthService): AuthState {
  const [state, setState] = useState<AuthState>(() => service.getState())
  useEffect(() => {
    setState(service.getState())
    return service.subscribe(next => setState(next))
  }, [service])
  // Expire rendered private content even when the user keeps a page open.
  // A timeout only invalidates UI; it never authenticates or refreshes an account.
  useEffect(() => {
    if (state.status !== 'authenticated' || !state.expiresAt) return
    const remaining = Date.parse(state.expiresAt) - Date.now()
    if (remaining <= 0) { service.verifiedIdentity(); return }
    const timer = setTimeout(() => { service.verifiedIdentity() },
      Math.min(remaining + 1, 2147483647))
    // Node unit tests do not need to keep the process alive for this UI timer.
    ;(timer as unknown as { unref?: () => void }).unref?.()
    return () => clearTimeout(timer)
  }, [service, state.status, state.expiresAt])
  return state
}

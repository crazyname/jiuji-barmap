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
  return state
}

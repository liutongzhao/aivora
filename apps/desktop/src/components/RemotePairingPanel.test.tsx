// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import RemotePairingPanel from './RemotePairingPanel'

it('shows connected time instead of the pairing countdown', () => {
  let notify: (state: any) => void = () => {}
  Object.assign(window, { electronAPI: { remoteControl: { onState: (callback: typeof notify) => { notify = callback; return () => {} } } } })
  render(<RemotePairingPanel />)
  act(() => notify({ connected: false, code: '1234ABCD', expiresAt: Date.now() + 60000 }))
  expect(screen.getByText('1234ABCD')).toBeTruthy()
  act(() => notify({ connected: true, status: 'active', connectedAt: Date.now() - 2000 }))
  expect(screen.queryByText('1234ABCD')).toBeNull()
  expect(screen.getByText(/手机已连接/)).toBeTruthy()
  expect(screen.getByText(/已连接时长/)).toBeTruthy()
  act(() => notify({ connected: false, status: 'replaced', reason: 'new_remote_session' }))
  expect(screen.getByText(/其他设备建立远程连接/)).toBeTruthy()
});

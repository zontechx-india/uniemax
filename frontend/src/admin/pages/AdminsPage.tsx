import { useState } from 'react'
import { adminApi } from '../features/adminApi'
import { useAdminQuery } from '../features/useAdminQuery'
import { useAdminSession } from '../app/adminSession'
import type { Admin } from '../../shared/auth/authApi'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import {
  Button,
  Card,
  CardHeader,
  Chip,
  ErrorState,
  PageHeader,
  PasswordInput,
  SelectInput,
  Skeleton,
  TextInput,
} from '../ui/primitives'
import { formatDateTime } from '../ui/format'

/**
 * Admin accounts — SUPER_ADMIN only (the API enforces it independently of
 * this page being reachable).
 *
 * Two rules keep the console from locking itself out or being taken over, and
 * the server refuses to break either:
 *   - nobody may change their own role or deactivate themselves;
 *   - the last active super admin cannot be demoted or deactivated.
 *
 * There is no self-service password reset on the admin surface — a super
 * admin sets one here, and doing so revokes every session that admin had, so
 * a reset prompted by a suspected compromise actually ends it.
 */

const PASSWORD_HINT = 'At least 12 characters with upper case, lower case and a number.'

export default function AdminsPage() {
  const { admin: me } = useAdminSession()
  const { data: admins, loading, error, refresh } = useAdminQuery(() => adminApi.listAdmins(), [])

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'ADMIN' })
  const [resetTarget, setResetTarget] = useState<Admin | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const guard = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true)
    setFormError(null)
    try {
      await action()
      setNotice(success ?? null)
      refresh()
      return true
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
      return false
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={refresh} />

  return (
    <>
      <PageHeader
        title="Admin users"
        subtitle="Who can sign in to this console"
        actions={
          <Button variant="primary" onClick={() => setCreating((value) => !value)}>
            {creating ? 'Cancel' : 'Add admin'}
          </Button>
        }
      />

      {notice ? (
        <p className="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-fg">
          {notice}
        </p>
      ) : null}

      {creating ? (
        <Card className="mb-4">
          <CardHeader title="New admin account" />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="Email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              autoComplete="off"
            />
            <TextInput
              label="Name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              autoComplete="off"
            />
            <PasswordInput
              label="Password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              hint={PASSWORD_HINT}
              autoComplete="new-password"
            />
            <SelectInput
              label="Role"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              options={[
                { value: 'ADMIN', label: 'Admin' },
                { value: 'SUPER_ADMIN', label: 'Super admin (can manage admins)' },
              ]}
            />
          </div>
          {formError ? <p className="mt-3 text-sm text-danger">{formError}</p> : null}
          <div className="mt-4">
            <Button
              variant="primary"
              disabled={busy || !form.email || !form.password}
              onClick={() =>
                void guard(async () => {
                  await adminApi.createAdmin({
                    email: form.email,
                    password: form.password,
                    ...(form.name ? { name: form.name } : {}),
                    role: form.role as 'ADMIN' | 'SUPER_ADMIN',
                  })
                  setCreating(false)
                  setForm({ email: '', password: '', name: '', role: 'ADMIN' })
                }, 'Admin account created.')
              }
            >
              {busy ? 'Creating…' : 'Create admin'}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card padding="none">
        {loading && !admins ? (
          <Skeleton rows={4} className="p-4" />
        ) : (
          <ul className="divide-y divide-line">
            {(admins ?? []).map((admin) => {
              const isMe = admin.id === me.id
              return (
                <li key={admin.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                      {admin.name ?? admin.email}
                      {isMe ? <Chip tone="brand">You</Chip> : null}
                      <Chip tone={admin.role === 'SUPER_ADMIN' ? 'info' : 'neutral'}>
                        {admin.role === 'SUPER_ADMIN' ? 'Super admin' : 'Admin'}
                      </Chip>
                      {admin.isActive ? null : <Chip tone="danger">Deactivated</Chip>}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {admin.email} · last signed in {formatDateTime(admin.lastLoginAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy || isMe}
                      onClick={() =>
                        void guard(
                          () =>
                            adminApi.updateAdmin(admin.id, {
                              role: admin.role === 'SUPER_ADMIN' ? 'ADMIN' : 'SUPER_ADMIN',
                            }),
                          'Role updated.',
                        )
                      }
                    >
                      {admin.role === 'SUPER_ADMIN' ? 'Make admin' : 'Make super admin'}
                    </Button>
                    <Button
                      onClick={() => {
                        setResetTarget(admin)
                        setNewPassword('')
                        setFormError(null)
                      }}
                    >
                      Reset password
                    </Button>
                    <Button
                      variant={admin.isActive ? 'danger' : 'secondary'}
                      disabled={busy || isMe}
                      onClick={() =>
                        void guard(
                          () => adminApi.updateAdmin(admin.id, { isActive: !admin.isActive }),
                          admin.isActive ? 'Admin deactivated.' : 'Admin reactivated.',
                        )
                      }
                    >
                      {admin.isActive ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {formError && !creating ? (
          <p className="border-t border-line px-4 py-3 text-sm text-danger">{formError}</p>
        ) : null}
      </Card>

      <ConfirmDialog
        open={resetTarget !== null}
        busy={busy}
        title="Set a new password?"
        tone="danger"
        confirmLabel="Reset password"
        description={
          <div className="space-y-3">
            <p>
              Every session of <strong className="text-fg">{resetTarget?.email}</strong> is signed
              out immediately, including their own.
            </p>
            <PasswordInput
              label="New password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              hint={PASSWORD_HINT}
              autoComplete="new-password"
            />
            {formError ? <p className="text-sm text-danger">{formError}</p> : null}
          </div>
        }
        onCancel={() => setResetTarget(null)}
        onConfirm={() =>
          void guard(async () => {
            await adminApi.resetAdminPassword(resetTarget!.id, newPassword)
            setResetTarget(null)
            setNewPassword('')
          }, 'Password reset — that admin has been signed out everywhere.')
        }
      />
    </>
  )
}

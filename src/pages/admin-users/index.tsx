import { useState } from 'react';
import { useAuth } from '@/app/auth';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  useAdminUsers,
  useChangeRole,
  useCreateUser,
  useRemoveAccess,
  useResetPassword,
} from '@/features/admin/api';
import { formatDateTime } from '@/lib/time';
import type { AdminUser } from '@/types/api';

const ROLES: Array<[AdminUser['role'], string]> = [
  ['admin', 'Admin'],
  ['owner', 'Owner'],
  ['editor', 'Editor'],
];

/** A password is shown once: the server keeps only its hash. */
function NewPassword({
  email,
  password,
  onClose,
}: {
  email: string;
  password: string;
  onClose: () => void;
}) {
  return (
    <Card role="status" className="space-y-2 border-accent p-4">
      <p className="font-medium">Password for {email}</p>
      <p className="select-all break-all rounded-md bg-ground p-3 font-mono text-sm">{password}</p>
      <p className="text-sm text-muted">
        Copy it now and send it privately. It is not shown again.
      </p>
      <Button size="sm" variant="outline" onClick={onClose}>
        Done
      </Button>
    </Card>
  );
}

export default function AdminUsersPage() {
  const { profile } = useAuth();
  const { data: users = [], isLoading, error } = useAdminUsers();
  const create = useCreateUser();
  const role = useChangeRole();
  const remove = useRemoveAccess();
  const reset = useResetPassword();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [newRole, setNewRole] = useState<AdminUser['role']>('editor');
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);
  const active = users.filter((u) => u.active);
  const onlyAdmin = active.filter((u) => u.role === 'admin').length <= 1;
  const failure = create.error ?? role.error ?? remove.error ?? reset.error;

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in to the portal, and what they can do."
      />
      <div className="mt-6 space-y-6">
        <p className="text-sm" aria-live="polite">
          <strong className="text-2xl font-semibold">{active.length}</strong>{' '}
          {active.length === 1 ? 'person has' : 'people have'} access
          {users.length > active.length && ` (${users.length - active.length} removed)`}.{' '}
          {ROLES.map(
            ([r, label]) => `${active.filter((u) => u.role === r).length} ${label.toLowerCase()}`,
          ).join(' · ')}
        </p>

        {shown && <NewPassword {...shown} onClose={() => setShown(null)} />}
        {failure && (
          <p role="alert" className="text-sm text-danger">
            {failure.message}
          </p>
        )}

        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="p-3">Person</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3">Last sign-in</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="p-3 text-muted" colSpan={5}>
                    Loading…
                  </td>
                </tr>
              )}
              {error && (
                <tr>
                  <td className="p-3 text-danger" colSpan={5}>
                    {error.message}
                  </td>
                </tr>
              )}
              {users.map((u) => {
                const me = u.id === profile?.id;
                return (
                  <tr key={u.id} className="border-t border-line">
                    <td className="p-3">
                      <p className="font-medium">
                        {u.full_name ?? u.email}
                        {me && <span className="ml-2 text-xs text-muted">(you)</span>}
                      </p>
                      <p className="font-mono text-xs text-muted">{u.email}</p>
                    </td>
                    <td className="p-3">
                      <label className="sr-only" htmlFor={`role-${u.id}`}>
                        Role of {u.email}
                      </label>
                      <Select
                        id={`role-${u.id}`}
                        value={u.role}
                        disabled={role.isPending || (me && onlyAdmin)}
                        onChange={(e) =>
                          role.mutate({ id: u.id, role: e.target.value as AdminUser['role'] })
                        }
                        className="w-32"
                      >
                        {ROLES.map(([r, label]) => (
                          <option key={r} value={r}>
                            {label}
                          </option>
                        ))}
                      </Select>
                      {me && onlyAdmin && (
                        <p className="mt-1 max-w-[12rem] text-xs text-muted">
                          You are the only admin. Add another admin to change this.
                        </p>
                      )}
                    </td>
                    <td className="p-3">
                      {!u.active ? (
                        <span className="text-danger">Access removed</span>
                      ) : u.locked_until ? (
                        <span className="text-warning">Locked (too many wrong passwords)</span>
                      ) : (
                        <span className="text-success">Active</span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {u.last_sign_in
                        ? formatDateTime(u.last_sign_in, 'America/New_York')
                        : 'Never'}
                    </td>
                    <td className="space-x-2 p-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reset.isPending}
                        onClick={() =>
                          reset.mutate(u.id, {
                            onSuccess: (r) => setShown({ email: u.email, password: r.password }),
                          })
                        }
                      >
                        {u.active ? 'Reset password' : 'Restore access'}
                      </Button>
                      {u.active && !me && (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (
                              window.confirm(`Remove ${u.email}'s access? They will be signed out.`)
                            )
                              remove.mutate(u.id);
                          }}
                        >
                          Remove access
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card className="space-y-4 p-4">
          <h2 className="text-lg font-semibold">Add a person</h2>
          <form
            className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_12rem_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(
                {
                  email,
                  role: newRole,
                  ...(fullName.trim() ? { full_name: fullName.trim() } : {}),
                },
                {
                  onSuccess: (r) => {
                    setShown({ email: r.user.email, password: r.password });
                    setEmail('');
                    setFullName('');
                  },
                },
              );
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                required
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-name">Name (optional)</Label>
              <Input id="new-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-role">Role</Label>
              <Select
                id="new-role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as AdminUser['role'])}
              >
                {ROLES.map(([r, label]) => (
                  <option key={r} value={r}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={create.isPending || !email}>
              {create.isPending ? 'Adding…' : 'Add person'}
            </Button>
          </form>
          <p className="text-sm text-muted">
            Admin: everything, including this page, prompts and usage. Owner: topics, approvals and
            scheduling. Editor: content work only.
          </p>
        </Card>
      </div>
    </>
  );
}

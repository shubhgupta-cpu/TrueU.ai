import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/app/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { profile, signIn } = useAuth();
  const location = useLocation();
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const from = (location.state as { from?: string } | null)?.from ?? '/inbox';
  if (profile) return <Navigate to={from} replace />;

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setMessage(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Sign-in failed.' });
    }
  });

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="font-mono text-xs uppercase tracking-wider text-muted">TrueU.ai</p>
          <CardTitle>Content Cockpit</CardTitle>
          <p className="text-sm text-muted">
            Sign in with your invited account. Ask an admin if you need a password.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email')}
              />
              {errors.email && (
                <p id="email-error" className="text-sm text-danger">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...register('password')}
              />
              {errors.password && (
                <p id="password-error" className="text-sm text-danger">
                  {errors.password.message}
                </p>
              )}
            </div>
            {message && (
              <p
                role={message.tone === 'error' ? 'alert' : 'status'}
                className={
                  message.tone === 'error' ? 'text-sm text-danger' : 'text-sm text-success'
                }
              >
                {message.text}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

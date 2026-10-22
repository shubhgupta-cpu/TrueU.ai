import { useAuth } from '@/app/auth';
import { Button } from '@/components/ui/button';

export default function NoAccessPage() {
  const { profile, signOut } = useAuth();
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">No access</h1>
      <p className="max-w-md text-sm text-muted">
        {profile
          ? `Your account (${profile.email}) has the ${profile.role} role, which can’t open this page. Ask an admin if you need access.`
          : 'Your profile hasn’t been set up yet. Ask an admin to finish your invite.'}
      </p>
      <Button variant="outline" onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}

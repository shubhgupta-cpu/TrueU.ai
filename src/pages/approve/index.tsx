import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Public page (no login). Confirm / request-changes flow is built in Phase 2 (F7.2). */
export default function ApprovePage() {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Approval</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted">Email approvals arrive in Phase 2.</CardContent>
      </Card>
    </div>
  );
}

import { toneClasses, type StatusMeta } from '@/lib/status';
import { cn } from '@/lib/utils';

/** Status pill: always a text label on a tinted background, never colour alone. */
export function StatusBadge({ meta, className }: { meta: StatusMeta; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        toneClasses[meta.tone],
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

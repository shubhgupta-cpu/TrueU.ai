import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useSubmitTopic } from '../api';
import { submitTopicSchema, type SubmitTopicValues } from '../schema';

export function SubmitTopicDialog({
  open,
  onOpenChange,
  categories,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  onSubmitted: (id: string) => void;
}) {
  const submit = useSubmitTopic();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SubmitTopicValues>({ resolver: zodResolver(submitTopicSchema) });
  const titleLength = watch('title')?.length ?? 0;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const topic = await submit.mutateAsync(values);
      reset();
      onOpenChange(false);
      onSubmitted(topic.id);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Couldn’t submit the topic.');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Submit a topic</DialogTitle>
        <DialogDescription>
          It’s scored automatically against the 60-point rubric.
        </DialogDescription>
        <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label htmlFor="t-title">Title</Label>
              <span className="font-mono text-xs text-muted" aria-live="polite">
                {titleLength}/120
              </span>
            </div>
            <Input
              id="t-title"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 't-title-error' : undefined}
              {...register('title')}
            />
            {errors.title && (
              <p id="t-title-error" className="text-sm text-danger">
                {errors.title.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-description">Description</Label>
            <Textarea id="t-description" {...register('description')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-category">Category</Label>
            <Select id="t-category" {...register('category')}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-notes">Notes</Label>
            <Textarea
              id="t-notes"
              placeholder="Anything the team should know"
              {...register('notes')}
            />
          </div>
          {serverError && (
            <p role="alert" className="text-sm text-danger">
              {serverError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Submit topic
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

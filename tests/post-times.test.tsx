import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PostTimes } from '@/features/schedule/components/post-times';
import type { ScheduledPost } from '@/types/api';

const post = (id: string, platform: string, status: ScheduledPost['publish_status']) =>
  ({
    id,
    asset_role: 'short_1',
    platform,
    day: 1,
    local: '2026-11-03T09:00',
    custom: false,
    blocked: null,
    publish_status: status,
  }) as ScheduledPost;

describe('PostTimes', () => {
  it('offers one date picker per video for all its unsent posts, and locks sent posts', () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <PostTimes
            timezone="America/New_York"
            posts={[post('a', 'tiktok', 'planned'), post('b', 'threads', 'sent')]}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Set 1 post' })).toBeDefined();
    expect((screen.getByLabelText(/threads/i) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/tiktok/i) as HTMLInputElement).disabled).toBe(false);
  });
});

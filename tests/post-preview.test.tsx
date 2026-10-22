import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PostPreviewCard } from '@/components/previews/post-preview';
import type { PostPreview } from '@/types/api';

const long = `${'A long caption sentence. '.repeat(20)}THE END`;
const post = (over: Partial<PostPreview> = {}): PostPreview => ({
  key: 'k',
  platform: 'tiktok',
  asset_role: 'short_1',
  title: null,
  caption: long,
  hashtags: '#TrueUai #Career',
  status: 'approved',
  video_id: null,
  ...over,
});
const view = (p: PostPreview) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PostPreviewCard post={p} />
    </QueryClientProvider>,
  );

describe('post preview card', () => {
  it('shows the platform name with its logo and a short excerpt', () => {
    const { container } = view(post());
    expect(screen.getByText('TikTok')).toBeInTheDocument();
    expect(container.querySelector('svg path')).not.toBeNull();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('opens the full caption and hashtags', () => {
    view(post());
    expect(screen.queryByText('Copy caption and hashtags')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /View full preview/ }));
    expect(screen.getByText('Copy caption and hashtags')).toBeInTheDocument();
    expect(screen.getAllByText(/THE END/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('#TrueUai #Career').length).toBeGreaterThan(0);
  });

  it('flags an unapproved caption', () => {
    view(post({ status: 'draft' }));
    expect(screen.getByText('Not approved')).toBeInTheDocument();
  });
});

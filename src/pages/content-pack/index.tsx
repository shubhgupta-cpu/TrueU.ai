import { ComingInPhase, PageHeader } from '@/components/page-header';

export default function ContentPackPage() {
  return (
    <>
      <PageHeader
        title="Content Pack"
        description="Captions, metadata and previews per asset and platform."
      />
      <ComingInPhase phase={4} />
    </>
  );
}

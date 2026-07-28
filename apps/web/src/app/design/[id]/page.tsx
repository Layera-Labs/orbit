import { DesignClient } from '@/features/design/DesignClient';

export default function DesignPage({ params }: { params: { id: string } }) {
  return <DesignClient projectId={params.id} />;
}

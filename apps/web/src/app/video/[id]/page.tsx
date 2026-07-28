import { redirect } from 'next/navigation';

/** See `app/image/[id]/page.tsx` — one editor, old links preserved. */
export default function LegacyVideoPage({ params }: { params: { id: string } }) {
  redirect(`/design/${params.id}`);
}

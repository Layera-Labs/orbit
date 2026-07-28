import { redirect } from 'next/navigation';

/**
 * There is one editor now. Kept as a redirect rather than deleted because
 * projects created before the merge were linked from here, and a bookmark or an
 * open tab should still land on the right document.
 */
export default function LegacyImagePage({ params }: { params: { id: string } }) {
  redirect(`/design/${params.id}`);
}

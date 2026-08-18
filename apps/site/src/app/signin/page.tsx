import type { Metadata } from 'next';
import { SignIn } from '@/components/SignIn';
import { githubEnabled } from '@/lib/api';
import styles from './signin.module.css';

export const metadata: Metadata = {
  title: 'Sign in',
  // A sign-in page in a search index is noise at best, and a phishing target
  // at worst once it starts ranking for the brand.
  robots: { index: false, follow: false },
};

/**
 * PLATE 03. Its own shell: no marketing nav, no app sidebar.
 *
 * That is why this route sits outside both the `(marketing)` group and `app/`
 * — a chrome-free page is not a variant of either, and giving it one of theirs
 * would put a "Pricing" link or an empty dashboard rail beside a login form.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  // Asked, not assumed — see lib/api.ts.
  const github = await githubEnabled();

  return (
    <main className={styles.page}>
      <SignIn githubEnabled={github} initialError={searchParams.error} />
      <p className={styles.back}>
        <a href="/">Back to orbit</a>
      </p>
    </main>
  );
}

/**
 * A real 404. Next's built-in one is an unstyled black-on-white line that looks
 * like the app has been replaced by a different site.
 */
import { Failure } from '@/features/errors/Failure';

export default function NotFound() {
  return (
    <Failure
      title="There is nothing at this address."
      body="The link may be out of date, or the project it pointed at was deleted from this browser."
    />
  );
}

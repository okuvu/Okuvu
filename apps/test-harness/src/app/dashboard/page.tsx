import { redirect } from 'next/navigation';

/**
 * /dashboard is retired.
 *
 * It used to be the six-tile operator wall (Chat, Agent, Pipeline, Personas,
 * Results, Fault injection), and the front page linked to it in small print.
 * That made testing.okuvu.in look unchanged after the landing page was
 * rebuilt: anyone with the URL bookmarked — or anyone who clicked the small
 * print — landed on the old wall and concluded the deploy had not happened.
 *
 * There is now exactly one front page (`/`, two tiles: Chat and Results) and
 * exactly one operator view (`/operator`). This route exists only so old
 * bookmarks and old links land somewhere sensible instead of on a second,
 * differently-shaped home page.
 */
export default function DashboardRedirect() {
  redirect('/');
}

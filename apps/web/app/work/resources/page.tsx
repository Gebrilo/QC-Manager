import { redirect } from 'next/navigation';
// ponytail: legacy/dead URL guard — sidebar links to /team/resources; this catches stale bookmarks/tabs (issue #294)
export default function WorkResourcesRedirect() { redirect('/team/resources'); }

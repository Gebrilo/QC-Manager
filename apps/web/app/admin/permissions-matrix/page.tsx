import { redirect } from 'next/navigation';
// ponytail: legacy/dead URL guard — sidebar links to /admin/permissions/matrix; this catches stale bookmarks/tabs (issue #293)
export default function PermissionsMatrixRedirect() { redirect('/admin/permissions/matrix'); }

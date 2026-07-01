'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { UnauthorizedPage } from '@/components/PermissionGuard';

// /admin/* is the admin console. Only the admin role may render these pages;
// every other role gets a stable 403 page regardless of any per-user
// permission overrides (issues #289, #290, #295). The API remains the
// security boundary; this guard just stops the UI from leaking admin
// controls to non-admins.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, isAdmin } = useAuth();
    if (!user) return null;
    if (!isAdmin) return <UnauthorizedPage />;
    return <>{children}</>;
}

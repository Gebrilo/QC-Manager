import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Markdown content for key public pages
const MARKDOWN_PAGES: Record<string, string> = {
  '/': `# QC Manager

**Plan, test, govern, and report quality work from one operational workspace.**

## Overview

QC Manager is a quality management platform that helps teams:
- Manage projects, tasks, and bugs
- Create and execute test cases and test suites
- Track test runs and results
- Generate reports and dashboards
- Govern quality through gates and approvals

## Key Features

- **Work Management**: Projects, tasks, user stories, bugs
- **Test Management**: Test cases, test suites, test runs
- **Quality Gates**: Release approvals and governance
- **Team Collaboration**: Roles, permissions, notifications
- **Reporting**: Dashboards, metrics, and exports
- **Integrations**: Tuleap sync, n8n workflows, API access

## Getting Started

Visit [QC Manager](${process.env.PUBLIC_SITE_URL || 'https://gebrils.cloud'}) to sign up or log in.

## API

QC Manager provides a REST API for automation and integration.
API documentation is available to authenticated users at \`/api\`.

## Support

Contact the QC team for support and inquiries.
`,
  '/login': `# QC Manager — Login

Sign in to access your QC Manager workspace.

- Navigate to [QC Manager Login](${process.env.PUBLIC_SITE_URL || 'https://gebrils.cloud'}/login)
- Enter your email and password
- Use the "Remember me" option for persistent sessions

## Need an account?

Visit the [registration page](${process.env.PUBLIC_SITE_URL || 'https://gebrils.cloud'}/register) to create a new account.
`,
  '/register': `# QC Manager — Register

Create a new QC Manager account to get started.

- Navigate to [QC Manager Registration](${process.env.PUBLIC_SITE_URL || 'https://gebrils.cloud'}/register)
- Fill in your details to create an account
- Verify your email to activate your account

## Already have an account?

Visit the [login page](${process.env.PUBLIC_SITE_URL || 'https://gebrils.cloud'}/login) to sign in.
`,
};

export function middleware(request: NextRequest) {
  const acceptHeader = request.headers.get('accept') || '';

  // Only handle markdown requests
  if (!acceptHeader.includes('text/markdown')) {
    return NextResponse.next();
  }

  // Only handle GET requests
  if (request.method !== 'GET') {
    return NextResponse.next();
  }

  // Don't intercept static assets, API calls, well-known, or Next.js internals
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api-proxy') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/.well-known') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Serve markdown content for known pages, or a generic response
  const markdown = MARKDOWN_PAGES[pathname];
  const body = markdown || `# ${pathname}\n\nThis page is part of the QC Manager application.\nVisit [QC Manager](${process.env.PUBLIC_SITE_URL || 'https://gebrils.cloud'}) for more information.\n`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=UTF-8',
      'Vary': 'Accept',
    },
  });
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals, static files, and well-known
    '/((?!_next|api-proxy|favicon.ico|robots.txt|sitemap.xml|icon.svg|fonts|\\.well-known).*)',
  ],
};

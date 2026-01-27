# QC Management - Component Usage Guide

## Quick Reference

### Button Variants
```tsx
import { Button } from '@/components/ui/Button';

// Primary (Gradient) - For main CTAs
<Button variant="primary">Create Project</Button>

// Default (Solid) - For secondary actions
<Button variant="default">Save</Button>

// Outline - For tertiary actions
<Button variant="outline">Cancel</Button>

// Destructive - For delete/remove actions
<Button variant="destructive">Delete</Button>
```

### Badge Status Variants
```tsx
import { Badge } from '@/components/ui/Badge';

// Project Status
<Badge variant="complete">Complete</Badge>
<Badge variant="ontrack">On Track</Badge>
<Badge variant="atrisk">At Risk</Badge>
<Badge variant="notasks">No Tasks</Badge>

// Task Status
<Badge variant="inprogress">In Progress</Badge>
<Badge variant="backlog">Backlog</Badge>
<Badge variant="cancelled">Cancelled</Badge>
```

### Progress Bar
```tsx
import { ProgressBar } from '@/components/ui/ProgressBar';

<ProgressBar value={75} variant="ontrack" />
<ProgressBar value={100} variant="complete" />
<ProgressBar value={45} variant="atrisk" />
```

### Card Components
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';

<Card hover> {/* hover prop adds interactive shadow */}
  <CardHeader>
    <CardTitle>Project Overview</CardTitle>
    <CardDescription>Track your project metrics</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content here */}
  </CardContent>
</Card>
```

### Stat Card
```tsx
import { StatCard } from '@/components/ui/StatCard';

<StatCard 
  label="Total Tasks" 
  value={42}
  trend={{ value: 12, isPositive: true }}
/>
```

## Layout Patterns

### Dashboard Grid
```tsx
<div className="max-w-7xl mx-auto py-6 px-4 space-y-8">
  {/* Stats Grid */}
  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-y-6 gap-x-4">
    <StatCard label="Projects" value={12} />
    <StatCard label="Tasks" value={48} />
    {/* ... */}
  </div>

  {/* Cards Grid */}
  <div className="grid grid-cols-1 gap-8">
    <Card>
      {/* Card content */}
    </Card>
  </div>
</div>
```

## Color Utilities

### Status Colors
- Complete: `text-emerald-600`, `bg-emerald-100`
- On Track: `text-blue-600`, `bg-blue-100`
- At Risk: `text-rose-600`, `bg-rose-100`
- No Tasks: `text-slate-400`, `bg-slate-100`

### Typography
- Page Title: `text-2xl font-bold text-slate-900 dark:text-white`
- Section Header: `text-xl font-bold`
- Card Title: `text-lg font-semibold`
- Label: `text-[10px] uppercase font-bold tracking-wider text-slate-400`
- Body: `text-sm text-slate-700 dark:text-slate-300`

# QC Management - Design System

## Color Palette

### Brand Colors
- **Primary Gradient**: `from-indigo-600 to-violet-600`
- **Hover Gradient**: `from-indigo-700 to-violet-700`

### Neutral Base (Slate Scale)
- **Background Light**: `slate-50` (#f8fafc)
- **Background Dark**: `slate-950` (#020617)
- **Surface Light**: `white` with `slate-200` borders
- **Surface Dark**: `slate-900` with `slate-800` borders

### Status Colors
- **Complete/Success**: `emerald-500` (bg: `emerald-100`)
- **On Track**: `blue-500` (bg: `blue-100`)
- **At Risk**: `rose-500` (bg: `rose-100`)
- **No Tasks**: `slate-400` (bg: `slate-100`)

## Typography

### Font Stack
```css
font-family: 'Inter', system-ui, -apple-system, sans-serif;
```

### Hierarchy
- **Page Titles**: `text-2xl font-bold text-slate-900 dark:text-white`
- **Section Headers**: `text-xl font-bold`
- **Card Titles**: `text-lg font-semibold`
- **Labels**: `text-[10px] uppercase font-bold tracking-wider text-slate-400`
- **Body**: `text-sm text-slate-700 dark:text-slate-300`
- **Descriptions**: `text-sm text-slate-500 dark:text-slate-400`

## Component Patterns

### Cards
```tsx
className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
```

### Primary Button
```tsx
className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white px-4 py-2 rounded-lg shadow-lg shadow-indigo-500/30 transition-all"
```

### Status Badge
```tsx
className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
// + status color classes
```

### Progress Bar
```tsx
<div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
  <div className="h-full bg-emerald-500 transition-all duration-1000" style={{width: '70%'}} />
</div>
```

## Layout

### Container
```tsx
className="max-w-7xl mx-auto py-6 px-4"
```

### Section Spacing
```tsx
className="space-y-6" // or space-y-8
```

### Grid Layouts
```tsx
className="grid grid-cols-1 gap-8"
className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-y-6 gap-x-4"
```

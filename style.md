# QC Management Tool - Style Guide

This document serves as the official design system and style guide for the QC Management Tool. It defines the visual language, design tokens, and component patterns used across the application.

## Core Design Philosophy

The QC Management Tool aims for a **premium, professional, and high-performance** aesthetic. It uses a clean interface with subtle glassmorphism, smooth animations, and a sophisticated color palette to ensure a top-tier user experience.

---

## 1. Color Palette

The application uses a curated palette based on slate, indigo, and violet.

### Primary Colors
- **Indigo**: Used for primary actions, branding, and highlighting.
  - `500`: `#6366f1` (Standard)
  - `600`: `#4f46e5` (Hover)
  - `700`: `#4338ca` (Active)
- **Violet**: Used for accents and gradients.
  - `600`: `#7c3aed`

### Neutral Colors
- **Slate**: Used for text, backgrounds, and borders.
  - Background (Light): `slate-50` (`#f8fafc`)
  - Background (Dark): `slate-950` (`#020617`)
  - Text (Light): `slate-900` (`#0f172a`)
  - Text (Dark): `slate-100` (`#f1f5f9`)

---

## 2. Typography

- **Font Family**: Inter (Primary Sans-Serif)
- **Fallbacks**: system-ui, sans-serif

### Hierarchy
- **Brand Logo**: `text-xl font-bold`
- **Page Titles**: `text-3xl font-extrabold`
- **Section Headers**: `text-lg font-semibold`
- **Body Text**: `text-sm font-medium`

---

## 3. Layout Patterns

### Main Structure
- **Max Width**: `max-w-7xl`
- **Padding**: Responsive horizontal padding (`px-4 sm:px-6 lg:px-8`) with vertical padding (`py-6`).
- **Sidebar/Header**: Sticky header (`sticky top-0`) with glassmorphism effect (`backdrop-blur-md`).

### Glassmorphism
- **Class**: `bg-white/80 dark:bg-slate-900/80 backdrop-blur-md`
- **Border**: `border border-slate-200 dark:border-slate-800`

---

## 4. Component Styles

### Buttons
- **Primary**: Indigo background, white text, rounded-lg, transition effects.
- **Ghost**: Transparent background, slate text, hover with subtle background.

### Cards & Containers
- **Classes**: `bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm`

### Forms & Inputs
- **Base Style**: `bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg`
- **Focus State**: `focus:ring-2 focus:ring-indigo-500 outline-none`

---

## 5. Effects & Animations

### Shadows
- **Indigo Soft**: `0 10px 15px -3px rgba(99, 102, 241, 0.3)`

### Animations
- **Pulse Slow**: 3s pulse for subtle focus.
- **Micro-transitions**: `transition-all duration-300` on most interactive elements (buttons, links, theme toggle).

### Theme Support
- Full support for **Dark Mode** using the `class` strategy.
- Smooth transition between themes (`transition-colors duration-300`).

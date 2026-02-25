/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './app/**/*.{js,ts,jsx,tsx,mdx}',
        './pages/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            colors: {
                // Premium Palette
                slate: {
                    50: 'rgb(var(--color-slate-50) / <alpha-value>)',
                    100: 'rgb(var(--color-slate-100) / <alpha-value>)',
                    200: 'rgb(var(--color-slate-200) / <alpha-value>)',
                    300: 'rgb(var(--color-slate-300) / <alpha-value>)',
                    400: 'rgb(var(--color-slate-400) / <alpha-value>)',
                    500: 'rgb(var(--color-slate-500) / <alpha-value>)',
                    600: 'rgb(var(--color-slate-600) / <alpha-value>)',
                    700: 'rgb(var(--color-slate-700) / <alpha-value>)',
                    800: 'rgb(var(--color-slate-800) / <alpha-value>)',
                    900: 'rgb(var(--color-slate-900) / <alpha-value>)',
                    950: 'rgb(var(--color-slate-950) / <alpha-value>)',
                },
                indigo: {
                    50: 'rgb(var(--color-indigo-50) / <alpha-value>)',
                    100: 'rgb(var(--color-indigo-100) / <alpha-value>)',
                    200: 'rgb(var(--color-indigo-200) / <alpha-value>)',
                    300: 'rgb(var(--color-indigo-300) / <alpha-value>)',
                    400: 'rgb(var(--color-indigo-400) / <alpha-value>)',
                    500: 'rgb(var(--color-indigo-500) / <alpha-value>)',
                    600: 'rgb(var(--color-indigo-600) / <alpha-value>)',
                    700: 'rgb(var(--color-indigo-700) / <alpha-value>)',
                    800: 'rgb(var(--color-indigo-800) / <alpha-value>)',
                    900: 'rgb(var(--color-indigo-900) / <alpha-value>)',
                    950: 'rgb(var(--color-indigo-950) / <alpha-value>)',
                },
                violet: {
                    50: 'rgb(var(--color-violet-50) / <alpha-value>)',
                    100: 'rgb(var(--color-violet-100) / <alpha-value>)',
                    200: 'rgb(var(--color-violet-200) / <alpha-value>)',
                    300: 'rgb(var(--color-violet-300) / <alpha-value>)',
                    400: 'rgb(var(--color-violet-400) / <alpha-value>)',
                    500: 'rgb(var(--color-violet-500) / <alpha-value>)',
                    600: 'rgb(var(--color-violet-600) / <alpha-value>)',
                    700: 'rgb(var(--color-violet-700) / <alpha-value>)',
                    800: 'rgb(var(--color-violet-800) / <alpha-value>)',
                    900: 'rgb(var(--color-violet-900) / <alpha-value>)',
                    950: 'rgb(var(--color-violet-950) / <alpha-value>)',
                },
            },
            boxShadow: {
                'indigo-sm': '0 1px 2px 0 rgba(99, 102, 241, 0.05)',
                'indigo-md': '0 4px 6px -1px rgba(99, 102, 241, 0.1)',
                'indigo-lg': '0 10px 15px -3px rgba(99, 102, 241, 0.3)',
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
        },
    },
    plugins: [],
    darkMode: 'class',
}

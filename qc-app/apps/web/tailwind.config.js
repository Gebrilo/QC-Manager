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
                    50: '#f8fafc',
                    100: '#f1f5f9',
                    200: '#e2e8f0',
                    300: '#cbd5e1',
                    400: '#94a3b8',
                    500: '#64748b',
                    600: '#475569',
                    700: '#334155',
                    800: '#1e293b',
                    900: '#0f172a',
                    950: '#020617',
                },
                indigo: {
                    50: '#eef2ff',
                    100: '#e0e7ff',
                    200: '#c7d2fe',
                    300: '#a5b4fc',
                    400: '#818cf8',
                    500: '#6366f1',
                    600: '#4f46e5',
                    700: '#4338ca',
                    800: '#3730a3',
                    900: '#312e81',
                    950: '#1e1b4b',
                },
                violet: {
                    50: '#f5f3ff',
                    100: '#ede9fe',
                    200: '#ddd6fe',
                    300: '#c4b5fd',
                    400: '#a78bfa',
                    500: '#8b5cf6',
                    600: '#7c3aed',
                    700: '#6d28d9',
                    800: '#5b21b6',
                    900: '#4c1d95',
                    950: '#2e1065',
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

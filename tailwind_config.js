// tailwind.config.js

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./admin.html",
        "./js/**/*.js",
        "./**/*.html"
    ],
    theme: {
        extend: {},
    },




    plugins: [],
    safelist: [
        // Classes Tailwind pour les etats dynamiques
        'bg-green-50',
        'bg-green-100',
        'bg-orange-50',
        'bg-red-50',
        'bg-blue-50',
        'bg-purple-50',
        'bg-yellow-50',
        'bg-gray-50',

        // Grid 
        'grid-cols-2',
        'grid-cols-4',
        'sm:grid-cols-2',
        'lg:grid-cols-3',
        'xl:grid-cols-4',


        // Couleurs de texte dynamiques
        'text-green-600',
        'text-green-700',
        'text-green-800',
        'text-orange-600',
        'text-orange-700',
        'text-orange-800',
        'text-red-600',
        'text-red-700',
        'text-blue-600',
        'text-blue-700',
        'text-purple-600',

        // Bordures dynamiques
        'border-green-200',
        'border-orange-200',
        'border-red-200',
        'border-blue-200',

        // Classes pour animations
        'animate-bounce',
        'animate-fade-in',
        'opacity-0',
        'opacity-50',
        'opacity-60',

        // Transformations
        'scale-105',
        'translate-y-full',
        '-translate-y-px',

        // Hidden/visible
        'hidden',
        'invisible'


        // Classes actuellement utilisees dans le JS
        'min-h-screen',
        'flex',
        'items-center',
        'text-lg',
        'font-bold',
        'text-gray-600',
        'text-gray-800',
        'mr-4'


    ]
}
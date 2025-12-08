// tailwind.config.js

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./success.html",
        "./privacy.html",
        "./terms.html",
        "./**/*.html",
        "./*.js",
        "./**/*.js"
    ],

    theme: {
        extend: {
            // Animation légère utilisée dans l'UI (ex: écrans de résultats)
            keyframes: {
                "fade-in": {
                    "0%": { opacity: "0", transform: "translateY(4px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" }
                }
            },
            animation: {
                "fade-in": "fade-in 200ms ease-out"
            }
        }
    },

    safelist: [
        // Background dynamiques
        "bg-green-50",
        "bg-green-100",
        "bg-orange-50",
        "bg-red-50",
        "bg-blue-50",
        "bg-purple-50",
        "bg-yellow-50",
        "bg-gray-50",

        // Grilles utilisées dans les cartes stats / badges
        "grid-cols-2",
        "grid-cols-4",
        "sm:grid-cols-2",
        "lg:grid-cols-3",
        "xl:grid-cols-4",

        // Couleurs de texte dynamiques (scores, niveaux, messages)
        "text-green-600",
        "text-green-700",
        "text-green-800",
        "text-orange-600",
        "text-orange-700",
        "text-orange-800",
        "text-red-600",
        "text-red-700",
        "text-blue-600",
        "text-blue-700",
        "text-purple-600",

        // Bordures dynamiques (alertes, cartes, badges)
        "border-green-200",
        "border-orange-200",
        "border-red-200",
        "border-blue-200",

        // Animations
        "animate-bounce",
        "animate-fade-in",

        // Opacité / transformations utilisées dans les effets de clic
        "opacity-0",
        "opacity-50",
        "opacity-60",
        "opacity-70",
        "scale-95",
        "scale-105",
        "translate-y-full",
        "-translate-y-px",

        // Visibilité
        "hidden",
        "invisible",

        // Utilitaires génériques utilisés en JS/HTML
        "min-h-screen",
        "flex",
        "items-center",
        "text-lg",
        "font-bold",
        "text-gray-600",
        "text-gray-800",
        "mr-4",

        // Effets de clic sur les boutons stats (ui-charts)
        "transition",
        "duration-150",

        // Variantes de boutons premium / CTA (générés côté JS)
        "bg-indigo-600",
        "hover:bg-indigo-700",
        "bg-yellow-400",
        "hover:bg-yellow-300",
        "hover:bg-blue-50",
        "hover:bg-purple-50"
    ],

    plugins: []
};

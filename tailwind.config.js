module.exports = {
    content: [
        "./index.html",
        "./*.html",
        "./main.js",
        "./ui-core.js",
        "./ui-features.js",
        "./ui-charts.js",
        "./quizManager.js"
    ],
    theme: {
        extend: {
            colors: {
                primary: "rgb(var(--color-primary) / <alpha-value>)",
                success: "rgb(var(--color-success) / <alpha-value>)",
                premium: "rgb(var(--color-premium) / <alpha-value>)",
                danger: "rgb(var(--color-danger) / <alpha-value>)",
                free: "rgb(var(--color-free) / <alpha-value>)",
            },
            borderRadius: {
                button: "var(--radius-button)",
                card: "var(--radius-card)",
            },
            spacing: {
                xs: "var(--spacing-xs)",
                sm: "var(--spacing-sm)",
                md: "var(--spacing-md)",
                lg: "var(--spacing-lg)",
                card: "var(--spacing-card)",
                section: "var(--spacing-section)",
            },
            zIndex: {
                floating: "var(--z-floating)",
                modal: "var(--z-modal)",
                notification: "var(--z-notification)",
                skip: "var(--z-skip)",
                overlay: "var(--z-overlay)",
            },
        },
    },
    plugins: [],
};

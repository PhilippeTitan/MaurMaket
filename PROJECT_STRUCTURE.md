# MaurMaket — Project Structure

## Overview
MaurMaket is a local marketplace platform for Haiti, built with a clean, professional folder architecture to support scalable frontend and backend development.

## Folder Structure

```
MaurMaket/
├── frontend/                  # All front-end assets and pages
│   ├── assets/
│   │   ├── images/           # Logos, icons, product images
│   │   ├── css/              # Stylesheets (reserved for future)
│   │   └── js/               # JavaScript files (reserved for future)
│   └── pages/
│       ├── index.html        # Splash/entry page
│       ├── home.html         # Home/marketplace page
│       ├── customer.html     # Customer marketplace view
│       └── seller.html       # Seller dashboard
├── backend/                   # Backend API and services (empty for now)
├── utils/                     # Shared scripts and utilities
├── docs/                      # Documentation and design notes
├── README.md                  # This file
├── .gitignore
└── package.json (future)

```

## Pages

### Frontend

- **`frontend/pages/index.html`** — Splash/entry page with animated logo and smooth fade-in. Navigates to home.html.
- **`frontend/pages/home.html`** — Main marketplace landing page with category showcase and featured listings.
- **`frontend/pages/customer.html`** — Customer view with product carousel, filtering, and product detail modal.
- **`frontend/pages/seller.html`** — Seller dashboard with multi-view interface (dashboard, add product, listings, stats).

### Assets

All images, logos, and icons are in `frontend/assets/images/`:
- `Logo-Without-name.png` — MaurMaket logo (primary)
- `Logo-with-Name.png` — MaurMaket logo with text

## Color Palette (Tropical Haiti Theme)

- **Mango Orange** — `#FFA726`
- **Caribbean Teal** — `#26C6DA`
- **Papaya Coral** — `#FF7043`
- **Lime Green** — `#9CCC65`
- **Sunny Yellow** — `#FFCA28`
- **Hibiscus Pink** — `#EC407A`
- **Deep Sky Blue** — `#42A5F5`
- **Primary Text** — `#104084` (Deep Blue)

## How to Run

1. Open `index.html` in your browser (redirects to `frontend/pages/index.html`).
2. Or navigate directly to `frontend/pages/index.html`.
3. All pages are linked via navigation; no build process required (static HTML).

## Tech Stack

- **Frontend Framework** — Vanilla HTML5, TailwindCSS, Vanilla JavaScript
- **Images** — External links (iBB) for logos; local storage available
- **Version Control** — Git

## Future Development

- **Backend** — REST API or GraphQL (create in `/backend`)
- **CSS** — Extract inline styles to `/frontend/assets/css/` for modular styling
- **JavaScript** — Move interactive logic to `/frontend/assets/js/`
- **Database** — Define schema in `/docs/`
- **Testing** — Add test suites in `/utils/` or dedicated `/tests/` folder

## Notes

- Inline CSS and JS are currently embedded in HTML for simplicity; separate into modular files as the project scales.
- External image links (iBB) are used for logos; consider migrating to self-hosted images in `frontend/assets/images/` for production.
- All relative paths are relative to each file's location in `frontend/pages/`.

## Author

**Maurinex Projects** — Built with care for Haiti's local commerce.

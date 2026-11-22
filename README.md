# Tiptangle — Travel Agency Website

An interactive, white-themed travel agency website, ready to deploy. It has no build step and uses plain HTML, CSS and JavaScript.

## What's inside
- Hero slideshow with a typewriter tagline and a quick trip finder
- "Most Experienced Places" infinite loop carousel
- Travel scope tabs: within the state, across states, across the country, international/abroad, overseas & offshore
- Explore by Theme: cultural, hill stations, couple, historic, bachelor party, honeymoon, beach, adventure
- Trip types: solo, family, friends, bachelor's, honeymoon, college IV, school IV, corporate
- **Budget meter**: drag it and matching packages pop up. Filter by trip type, place, flexibility and sort order
- Package catalog pop-up with itinerary and timings, multiple transport modes, vehicle and allowance, food, advantages, and inclusions. Its "Customise & Negotiate" button fills in the enquiry form
- Fleet, "Your Journey With Us" trust timeline, How It Works, Why Choose Us, milestones with count-up stats, travel blog, and food guide
- Testimonials, a "Rate your experience" star widget, a copy-to-clipboard promo code, and an enquiry form
- Floating WhatsApp/call buttons, "safe hands" toasts, an exit-intent offer, and confetti

## Editing content: only one file
Open **`js/data.js`**. All names, prices, places, images, steps, blog posts, milestones, contact details and the promo code are there.
Anything shown as `______`, `Package Name #1`, `Top Place #1` and so on is a blank for you to fill in.

- **Logo**: replace `assets/logo.svg`, or point `agency.logo` at your own file.
- **Images**: paste any image URL, or a local path like `assets/goa.jpg`.
- **Enquiry form**: set `enquiryMode` to one of:
  - `"whatsapp"`: opens WhatsApp with the details filled in. Set `agency.whatsapp`.
  - `"email"`: opens the visitor's email app addressed to `agency.email`.
  - `"formspree"`: sends to your inbox through Formspree. Set `formspreeEndpoint`.
  - `"netlify"`: uses Netlify Forms. This works automatically when the site is hosted on Netlify.
- **Budget range**: `budget.min / max / step / start`.
- **Map**: in Google Maps, choose Share → Embed a map, then copy the `src` URL into `agency.mapEmbed`.

## Run locally
```bash
python3 -m http.server 8000
```
Then open http://localhost:8000.

## Deploy
Upload the folder to any static host: Netlify (drag and drop), Vercel, GitHub Pages, cPanel hosting, or WordPress.com through static site import.

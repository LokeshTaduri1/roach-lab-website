# Powell-Roach Lab Website

The website for the Powell-Roach Lab (Dr. Keesha Roach, Rutgers University), which studies sickle cell disease and pain.
It is a static site written in plain HTML, CSS and JavaScript, with no build step. Open `index.html` in a browser to view it.

## Structure

```
index.html          Home: hero carousel, about, research areas, SCD facts, news, call to action
research.html       Research areas and methods
team.html           PI profile and lab members (filterable, with bio popups)
publications.html   Searchable and filterable publication list
contact.html        Contact form, join-the-lab opportunities, FAQ
css/styles.css      All styles; brand colors are at the top in :root
js/main.js          Navigation, carousel, counters, filters, modal, form validation
js/publications-data.js   Publication entries (edit this to update the list)
assets/logo.svg     Lab logo mark (header, footer, page watermarks)
assets/rutgers-favicon.ico, rutgers-icon.png   Official Rutgers "R" icon from rutgers.edu, used as the browser-tab / home-screen icon
assets/logo-full.png      Logo + wordmark (transparent PNG) for slides and posters
assets/logo-full-dark.png Same, for dark backgrounds
```

## Before publishing: replace the placeholders

| What | Where |
|---|---|
| Lab email (`email@rutgers.edu`) | footer of every page, `team.html`, `contact.html` (including `data-email` on the form) |
| Address and phone | `contact.html` |
| Dr. Roach's official bio and CV link | `team.html` (`#pi` section) |
| Lab members (names, roles, bios) | `team.html`: each `<button class="member">` |
| Publications (current entries are **samples**) | `js/publications-data.js` |
| News items | `index.html` (`#news` section) |
| Department or school name | top bar in each page, if you want to show it |

The header and footer are repeated in each HTML file, so a change to one has to be copied into all five.

## Group photos

- **Home page slider:** the full-width slider above "About the lab" shows `assets/gallery/group-1.jpg` … `group-3.jpg`. Captions are in `index.html` (search for `strip-slide`). The photo fills the width up to 1200px; on bigger screens it stays centred and a blurred copy of it (the `strip-bg` div, keep its file name the same as the `img`) fills both sides. The `object-position` on each `img` sets which part stays in view (lower % moves the crop up). To add more photos, copy one `<figure class="strip-slide">` block; the dots update themselves.
- **Join the Lab page banner:** `join.html` shows `assets/gallery/group-1.jpg` across the top. To use a different photo, change the `src` in the `photo-banner` section.

A missing file shows a "Group photo coming soon" placeholder. Wide landscape photos (at least 1800 px wide) look best.

## Adding photos

To replace an initials avatar with a photo, swap
`<div class="avatar" aria-hidden="true">KR</div>` for
`<img class="avatar" src="assets/people/roach.jpg" alt="Dr. Keesha Roach">` and add `object-fit: cover;` to `.avatar` in the CSS.

## Contact form

The form checks its fields in the browser, then opens the visitor's email app with the message already filled in. No server is needed.
To receive messages directly instead, point the form at a service such as Formspree and remove the `mailto` step in `js/main.js`.

## Hosting

Any static host works: GitHub Pages, Netlify, or Rutgers web hosting. Upload the whole folder.

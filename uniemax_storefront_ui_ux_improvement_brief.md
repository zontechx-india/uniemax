# UnieMax Storefront UI/UX Improvement Brief
## Target: KhidmatpayAi.Club mobile storefront

## 1. Objective

Improve the existing UnieMax seller storefront at:

https://uniemax.com/store/khidmatpayai-club

The current mobile storefront is functional, but the presentation feels like a basic product catalog rather than a polished, premium shopping experience. Improve the existing implementation at code level with a consistent, modern, mobile-first design system.

**Important:** Inspect the existing codebase and reuse its current architecture, framework, routing, API integration, state management, and component conventions. Do not rebuild the storefront from scratch or change business logic unnecessarily.

## 2. Main design direction

Create a clean, modern, professional e-commerce experience:

- Mobile-first, responsive, and touch-friendly.
- Product-focused: product images, names, prices, and purchase actions should be easy to understand.
- Consistent typography, spacing, colors, borders, image ratios, and button styles.
- Minimal decoration: avoid excessive shadows, gradients, borders, nested cards, and unnecessary animations.
- Use white or warm-neutral page surfaces and subtle grey product-image surfaces.
- Keep the seller's branding configurable. Do not hardcode KhidmatpayAi.Club branding across the entire UnieMax platform.
- Use the existing seller logo, product data, categories, prices, discounts, contact information, and policies. Do not create fake product data or offers.

## 3. Current problems observed in the mobile screenshot

1. Header content feels crowded; store name and logo compete with menu, share, and cart icons.
2. Search field looks disconnected from the header.
3. The store banner appears like a small logo graphic rather than a responsive storefront hero.
4. Category thumbnails are cramped, category labels are truncated, and the category section uses too much vertical space.
5. Product cards have inconsistent-looking image backgrounds and visual proportions.
6. Floating cart buttons overlap product images and can hide important product details.
7. Discount badges are visually dominant and do not feel integrated with the rest of the design.
8. Product titles wrap inconsistently or truncate awkwardly.
9. Current prices and crossed-out original prices do not have a strong enough hierarchy.
10. Section spacing and typography are inconsistent.
11. Support section occupies a lot of vertical space.
12. Footer is long and visually scattered.
13. Overall visual language is inconsistent across headings, badges, buttons, icons, and backgrounds.

## 4. Component-by-component requirements

### A. Store header

- Use a compact header, approximately 56–64 px high where practical.
- Align the menu, seller logo/name, share action, and cart action consistently.
- Allow long seller names to truncate gracefully instead of squeezing all controls.
- Use a consistent icon library and consistent icon size/stroke.
- Show a cart count badge only when a meaningful count is available.
- Ensure every icon action has an accessible label and a comfortable touch target (aim for around 44 x 44 px).
- Consider a sticky header only if it does not consume too much screen space or cause layout problems.
- Avoid adding duplicate branding or unnecessary decorative elements.

### B. Search field

- Integrate the search field visually with the header.
- Use a light neutral background, subtle border, clear search icon, and readable placeholder.
- Preserve existing search behavior and API calls.
- Ensure it fits narrow mobile screens without horizontal overflow.

### C. Store banner / hero

- Make the banner responsive; do not stretch a desktop image unnaturally on mobile.
- Preserve image aspect ratio or use a deliberate mobile crop with `object-fit: cover`.
- Use `object-fit: contain` if the banner is primarily a logo or text graphic that must remain fully visible.
- If the platform supports editable hero content, use the seller's existing configured content. Do not invent offers or claims.
- Avoid duplicating the store name if it is already clearly displayed in the header.
- Use an appropriate mobile height (roughly 140–190 px when it suits the actual content), but let the image and existing configuration determine the final layout.
- Do not replace seller-provided banner artwork without a good reason.

### D. Category section

- Keep the section heading and “View all”/“Browse all” action aligned on one row.
- Replace circular thumbnails with square or softly rounded thumbnails if compatible with the current design.
- Use `object-fit: contain` for product/category images where the full product should be visible.
- Prevent category names from truncating unnecessarily; allow two lines.
- Reduce excess vertical padding.
- Use a horizontal scrolling row if there are many categories, with clear touch behavior and no visible horizontal page overflow.
- Suggested starting values: 64–76 px thumbnails, 12–14 px labels, 12–16 px item gaps, 16 px section padding.
- Preserve category navigation and links.

### E. Product section heading and controls

- Use a clear 20–22 px semibold section title.
- Display the product count as secondary text, approximately 12–14 px.
- Keep heading, count, and any existing sorting/filter controls aligned.
- Add sorting/filtering only if supported by current product functionality; do not introduce non-functional controls.
- Keep consistent horizontal alignment with the rest of the page.

### F. Product cards — highest priority

Create a consistent card layout across all products:

1. Standardize image containers to one consistent aspect ratio (start with 4:3 or 1:1 and choose the better fit after checking the real product images).
2. Use a subtle neutral background behind product images.
3. Use `object-fit: contain` for electronics, biometric devices, packaged goods, and accessories where preserving the whole product is important.
4. Avoid cropping product edges or stretching images.
5. Use a consistent position and size for discount badges; make them small and readable rather than dominant.
6. Keep product names readable. Use a consistent line height and reserve a consistent title area of approximately two lines, with a sensible clamp only where needed.
7. Make the current price visually prominent (roughly 15–17 px, semibold).
8. Display the original price smaller and muted, with a line through it only when a valid discounted price exists.
9. Remove floating cart buttons that overlap product images. Prefer a clear “Add to Cart” action below the price, or a compact action placed in a dedicated non-overlapping area.
10. If a product has variants or requires a detail-page selection, use an appropriate “View options” or existing equivalent action rather than bypassing required selections.
11. Ensure cards align consistently across each grid row even when titles have different lengths.
12. Preserve existing cart state, add-to-cart logic, inventory rules, variant handling, analytics events, and error states.
13. Do not claim a discount or stock status unless supported by actual data.

Suggested mobile starting values:
- Page horizontal padding: 12–16 px.
- Grid gap: 12 px.
- Product title: 13–15 px.
- Price: 15–17 px.
- Vertical row gap: 20–24 px.
- Two columns on common mobile widths, adapting gracefully to narrower screens.
- Three or four columns on wider layouts only when each card remains readable.

### G. Typography and design tokens

Create or reuse shared design tokens rather than styling every component independently.

Suggested baseline:
- Main text: `#171717`
- Secondary text: `#6B7280`
- Page background: `#FFFFFF`
- Image/card surface: `#F4F5F7`
- Subtle border: `#E5E7EB`
- Dark primary action: `#111827`, unless the seller's configured brand color is used.
- Seller accent example from the platform's existing branding: `#F0C655` (do not force this color onto every seller storefront).
- Main section headings: 20–24 px, semibold.
- Body text: approximately 14 px.
- Supporting text: 12–13 px.
- Use an existing project font if it is already consistent; otherwise choose one modern sans-serif family and apply it consistently.
- Keep contrast accessible, especially for text placed on brand-colored buttons and discount badges.

The final color palette must respect the seller's configured theme. Do not hardcode the same accent color for every seller.

### H. Customer support section

- Reduce excessive vertical padding.
- Use a concise heading and one short support description.
- Make WhatsApp the primary action only if the configured seller support channel is WhatsApp.
- Keep Call as a secondary outlined action if a valid phone number exists.
- Preserve existing phone/WhatsApp links and their formatting.
- Do not invent support hours, service promises, or contact details.
- Ensure buttons are touch-friendly and have clear accessible names.

### I. Footer

- Group navigation and support links into clear sections.
- Reduce excessive vertical gaps while retaining enough space for readability.
- Keep store logo/name and “Powered by UnieMax” branding clear but not repetitive.
- Include only policies and links that exist and work.
- Ensure email, phone, WhatsApp, navigation, and policy links use correct destinations.
- Keep copyright text visually secondary.
- On mobile, consider collapsible footer groups only if they improve usability and are consistent with the existing implementation.

## 5. Responsive behavior

Test at minimum:
- 320 px wide
- 360 px wide
- 390 px wide
- 430 px wide
- Tablet width
- Desktop width

Requirements:
- No horizontal page overflow.
- No clipped text or inaccessible controls.
- Product cards remain readable and aligned.
- Long seller names, product titles, and category labels behave gracefully.
- Images preserve their intended aspect ratio.
- The layout adapts to wider screens without making product cards excessively wide.
- Sticky elements, if any, do not cover page content or browser controls.

## 6. Accessibility and usability

- Use semantic buttons and links.
- Add accessible names to icon-only controls.
- Keep keyboard focus visible.
- Ensure color contrast is adequate.
- Aim for touch targets around 44 x 44 px.
- Respect reduced-motion preferences if animations exist.
- Avoid using color alone to communicate discounts, errors, or selection states.
- Keep loading, empty, and error states polished and consistent.

## 7. Performance

- Preserve existing image CDN and optimization behavior.
- Use responsive image sizes where supported.
- Lazy-load below-the-fold images where appropriate.
- Avoid layout shifts by reserving image dimensions/aspect ratios.
- Do not add large UI libraries or dependencies unless necessary.
- Avoid unnecessary rerenders and do not break existing data fetching or caching.
- Keep the first visible product content fast to render.

## 8. Implementation instructions for Claude

Before editing:

1. Inspect the project structure and identify the storefront route and the components it uses.
2. Identify the current styling approach (CSS, Tailwind, CSS modules, styled components, or another system).
3. Identify theme/store configuration and determine how seller-specific branding is applied.
4. Trace the existing product data, cart interactions, search, category navigation, support links, and banner configuration.
5. Reuse existing components and conventions where possible.

Then implement:

1. Shared design tokens or theme variables.
2. Header and search improvements.
3. Responsive banner improvements.
4. Category section improvements.
5. Product card and grid redesign.
6. Support section and footer refinements.
7. Responsive and accessibility fixes.

Do not stop at a written plan. Make the code changes in the repository, then run the existing lint, type-check, tests, and build commands where available.

## 9. Strict constraints

- Do not change backend APIs or database schema for a visual redesign.
- Do not change routes, checkout behavior, payment integration, cart logic, pricing calculations, inventory rules, or seller data.
- Do not replace real product images with generated placeholders.
- Do not hardcode seller-specific text, phone numbers, email addresses, prices, discounts, or branding.
- Do not add fake buttons or controls that have no working behavior.
- Do not remove existing functionality to simplify the UI.
- Do not perform broad unrelated refactors.
- Keep changes maintainable and reusable across all UnieMax storefronts.
- If an existing feature's intended behavior is unclear, inspect its implementation and preserve it rather than guessing.

## 10. Definition of done

- The mobile storefront looks more premium, consistent, and professional.
- The product cards have consistent image dimensions, typography, price hierarchy, and purchase actions.
- The banner and categories are responsive and visually balanced.
- The header, search, support section, and footer use consistent spacing and styling.
- The store remains fully functional.
- Seller branding remains configurable and other stores are not unintentionally changed.
- There is no horizontal overflow at the tested viewport sizes.
- Existing lint/type checks/tests/build pass, or any pre-existing failures are clearly reported.
- Provide a concise summary of files changed, major UI changes, checks run, and any remaining issues.

## 11. Suggested implementation order

1. Product card and product grid.
2. Header and search.
3. Banner and categories.
4. Typography, spacing, and theme tokens.
5. Customer support and footer.
6. Responsive, accessibility, and performance verification.

**Final instruction:** Prioritize a polished, production-ready implementation using the actual existing code and data. Make the smallest maintainable set of changes that achieves the design improvements without breaking any storefront behavior.

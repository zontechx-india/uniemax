I need you to redesign the current UnieMax seller storefront UI to make it look like a polished, modern, production-ready e-commerce website.

IMPORTANT:
- Do NOT change any existing business logic, APIs, backend, routing, data models, authentication, cart functionality, product functionality, or store functionality.
- This is a FRONTEND UI/UX redesign only.
- Reuse the existing data and components where appropriate, but improve their visual design and composition.
- Do not create a completely different product experience. Keep the existing functionality and improve the presentation.
- Make the entire design responsive and production-ready for desktop, tablet and mobile.
- Do not use fixed widths that break on smaller screens.
- Do not simply scale the desktop UI down for mobile. Design proper responsive layouts.

REFERENCE:
I have provided a screenshot of the current UnieMax seller storefront. Use it as the starting point and redesign it based on the requirements below.

==================================================
1. OVERALL DESIGN DIRECTION
==================================================

The store should feel like a serious modern e-commerce storefront, not an admin dashboard.

Design goals:
- Clean
- Premium
- Minimal
- Modern
- Spacious
- Strong visual hierarchy
- Excellent product presentation
- Professional typography
- Consistent spacing
- Responsive
- Fast and practical
- Suitable for different seller/store types

Do NOT copy Flipkart directly.

Use the general principle of:
"full-width backgrounds + centered max-width content".

The storefront content should NOT stretch across the entire screen on large monitors.

Recommended desktop content:

max-width: approximately 1440px
margin: 0 auto
horizontal padding: approximately 24–40px depending on viewport

For very large screens, keep content constrained instead of stretching it indefinitely.

Example:

Desktop:
-----------------------------------------------
          [ MAX WIDTH STORE CONTENT ]
-----------------------------------------------

Large desktop:
---------------------------------------------------------------
              [ MAX WIDTH STORE CONTENT ]
---------------------------------------------------------------

Do not allow product cards, text and sections to become excessively wide.

==================================================
2. HEADER
==================================================

Keep the current store header functionality:

- Store logo
- Store name
- Home
- Shop
- Categories
- Help
- Search
- Share
- Cart
- Sign in/account

But redesign it with better spacing, typography and hierarchy.

Desktop:
- Header can be full width.
- Inner content should use the same max-width container.
- Store logo/name on the left.
- Navigation next.
- Search should have a clean modern appearance.
- Share/cart/account actions on the right.

Tablet:
- Reduce navigation spacing.
- Keep search usable.
- Hide less important navigation items if necessary.

Mobile:
Do NOT simply squeeze the desktop header.

Use a proper mobile header:

Top row:
[Menu] [Logo / Store Name] [Cart]

Second row:
[ Search products... ]

Navigation can open through a mobile drawer/sheet.

Make sure:
- Store name does not overflow.
- Long store names truncate gracefully.
- Search remains easy to use.
- Cart is always easily accessible.

==================================================
3. STORE HERO
==================================================

The current hero has too much empty space on the right when no store image/banner is configured.

Improve the hero significantly.

Preferred desktop layout:

-------------------------------------------------------
| Store information              Store visual/image  |
|                                                     |
| WELCOME TO                                          |
| Store Name                                          |
| Store description                                   |
|                                                     |
| [ Start Shopping ]                                  |
-------------------------------------------------------

If the seller has a configured hero image/banner:
- Use it beautifully.

If there is NO hero image:
- Do NOT leave a huge empty area.
- Use a balanced text-focused hero layout.
- The content should still look intentional and premium.

Hero should support:
- Store name
- Short description
- Primary CTA
- Optional secondary CTA
- Optional seller/store image
- Optional promotional content if available

Desktop should use approximately 2-column composition when visual content exists.

Mobile:
- Stack content vertically.
- Store image should appear below or above the text depending on the design.
- Keep the hero compact.
- Avoid excessive vertical whitespace.

==================================================
4. SHOP BY CATEGORY
==================================================

Keep the current functionality.

Improve the visual design.

Use:

SHOP BY CATEGORY

[ Computers & Accessories ] [ Laptops ] [ Accessories ] ...

If there are many categories:
- Horizontal scrolling on mobile.
- Do not wrap into an unnecessarily tall section.
- Keep category chips/cards clean and touch-friendly.

Desktop:
- Align category section with the main max-width content.

Mobile:
- Horizontal scroll.
- Hide scrollbar visually if appropriate while preserving usability.

==================================================
5. PRODUCT SECTIONS
==================================================

This is very important.

Do NOT make every section look like the same generic product grid.

For example:

NEW ARRIVALS
[product] [product] [product] [product]

FEATURED PRODUCTS
[large product] [product] [product]

CATEGORY COLLECTION
[image/category] [image/category] [image/category]

ALL PRODUCTS
[product] [product] [product]

Each section should have a different visual purpose while maintaining the same overall design system.

Keep the existing section data and functionality.

Use:
- Product grids
- Product carousels where appropriate
- Featured product layouts
- Editorial/collection layouts where appropriate
- Horizontal product rails when useful

Do not over-design every section.

The UI should remain clean.

==================================================
6. PRODUCT CARDS
==================================================

Redesign product cards to look modern and consistent.

Recommended structure:

--------------------------------
|                         ♡    |
|                              |
|       PRODUCT IMAGE          |
|                              |
--------------------------------
| CATEGORY                     |
| Product Name                 |
|                              |
| ₹1,74,990                    |
| Optional discount/offer      |
--------------------------------

Requirements:
- Consistent image aspect ratio.
- Product images should not stretch.
- Use object-fit appropriately.
- Handle missing images gracefully.
- Long product names should truncate cleanly.
- Price should have strong visual hierarchy.
- Category text should be subtle.
- Add hover interaction on desktop.
- Make cards touch-friendly on mobile.
- Avoid excessive shadows.
- Avoid excessive borders.
- Keep card height consistent within a row where possible.

If Add to Cart functionality already exists, preserve it and improve its presentation.

Do not remove existing product actions.

==================================================
7. EMPTY / MISSING PRODUCT IMAGES
==================================================

The current screenshot shows placeholder cube icons for missing product images.

Improve this.

Use a polished empty-image state that matches the UnieMax design system.

Do not make missing images look like broken content.

Example:
- Soft neutral background
- Simple product/image icon
- Proper centered alignment

==================================================
8. PRODUCT GRID RESPONSIVENESS
==================================================

Use responsive grids.

Desktop:
- 4–5 products per row depending on available width and card size.

Large desktop:
- Do NOT create extremely wide product cards just to fill space.

Tablet:
- Approximately 3 products per row.

Mobile:
- 2 products per row is preferred for normal product grids.

For very narrow screens:
- Maintain readable product cards.
- Avoid horizontal page overflow.

Use CSS Grid/Flexbox properly.

Do NOT use hardcoded pixel positioning.

==================================================
9. LARGE SCREEN BEHAVIOR
==================================================

This is critical.

The current store should look good at:

1366px
1440px
1536px
1920px
2560px

Do not let content stretch endlessly.

Recommended:

.store-container {
  width: 100%;
  max-width: 1440px;
  margin-inline: auto;
  padding-inline: 24px;
}

You can adjust the exact values based on the existing design system.

Full-width sections/backgrounds are allowed, but the actual content should remain constrained.

Example:

FULL WIDTH SECTION
-------------------------------------------------------

        MAX WIDTH CONTENT
        -----------------
        Section content

-------------------------------------------------------

==================================================
10. TABLET
==================================================

Make sure the design works properly around:

768px
834px
1024px

Adjust:
- Header
- Navigation
- Hero columns
- Product grids
- Category navigation
- Typography
- Section spacing

Do not allow desktop layouts to become cramped.

==================================================
11. MOBILE
==================================================

The mobile UI must be intentionally designed.

Test around:

320px
360px
375px
390px
412px
430px
480px

Requirements:
- No horizontal page scrolling.
- Proper mobile header.
- Search should be easily accessible.
- Hero should stack.
- Category chips should horizontally scroll.
- Product grids should normally use 2 columns.
- Buttons should be touch-friendly.
- Text should remain readable.
- Section spacing should be reduced appropriately.
- Product images should remain consistent.
- Avoid huge empty spaces.
- Avoid tiny text.
- Avoid desktop navigation overflowing.

==================================================
12. FOOTER
==================================================

Improve the footer while preserving existing functionality.

Use a clean responsive footer with:
- Store information
- Navigation
- Categories
- Help/contact if available
- Social links if available
- Legal links if available

Desktop:
Multi-column layout.

Mobile:
Stack into clean sections.

Do not invent functionality/data that does not exist.

==================================================
13. DESIGN SYSTEM
==================================================

Create or follow a consistent design system.

Use:
- Consistent typography scale
- Consistent border radius
- Consistent spacing
- Consistent button styles
- Consistent colors
- Consistent icon sizing
- Consistent product image ratios
- Consistent section headers

Avoid:
- Random border radiuses
- Too many shadows
- Too many colors
- Excessive gradients
- Excessive animations
- Inconsistent spacing

The store should feel like ONE coherent design system.

==================================================
14. ANIMATIONS
==================================================

Use subtle animations only.

Examples:
- Product card hover
- Button hover
- Image hover
- Carousel transitions
- Mobile drawer transitions

Avoid:
- Heavy animations
- Large page transitions
- Animations that hurt performance
- Anything that makes shopping slower

==================================================
15. ACCESSIBILITY
==================================================

Make the redesigned UI accessible.

Include:
- Proper semantic HTML
- Keyboard navigation
- Visible focus states
- Accessible buttons
- Accessible icon buttons
- Proper alt text where product/store image data is available
- Sufficient text contrast
- Touch-friendly controls

==================================================
16. PERFORMANCE
==================================================

Do not sacrifice performance for UI.

Be careful with:
- Large images
- Unnecessary animations
- Excessive DOM elements
- Unnecessary re-renders
- Large client-side bundles

Reuse existing image optimization mechanisms if present.

==================================================
17. IMPORTANT FOR UNIEMAX PLATFORM
==================================================

This is a white-label e-commerce platform.

Therefore, the storefront should NOT be tightly coupled to one seller.

The same UI must work for:

- Fashion stores
- Electronics stores
- Grocery stores
- Beauty stores
- Home stores
- General stores
- Stores with many products
- Stores with very few products
- Stores with many categories
- Stores with only one category
- Stores with and without hero images
- Stores with and without promotional content

Do not hardcode the current seller's name, categories, products, images or content into the UI.

Use the existing dynamic data.

==================================================
18. VERY IMPORTANT: DO NOT CHANGE FUNCTIONALITY
==================================================

Before modifying components, understand the existing implementation.

Preserve:
- Existing API calls
- Existing routes
- Existing data structures
- Existing product click behavior
- Existing cart behavior
- Existing authentication
- Existing category navigation
- Existing search behavior
- Existing share functionality
- Existing seller/store configuration
- Existing responsive/business logic

Only improve the UI/UX and frontend composition.

If an existing component already handles functionality correctly, keep the logic and redesign its presentation.

==================================================
19. CODE QUALITY
==================================================

Keep the implementation clean and maintainable.

Prefer:
- Reusable components
- Existing project conventions
- Existing UI libraries if already used
- Tailwind classes/design tokens if the project uses Tailwind
- Responsive utility classes
- Semantic component structure

Do not duplicate large blocks of code just to support different screen sizes.

Do not introduce a new UI framework unless absolutely necessary.

==================================================
20. FINAL TARGET
==================================================

The final storefront should feel like:

" A modern, premium, production-ready online store powered by UnieMax. "

Not:

" A dashboard displaying products. "

The visual hierarchy should be:

HEADER
↓
STORE IDENTITY / HERO
↓
SHOP BY CATEGORY
↓
FEATURED / IMPORTANT COLLECTION
↓
PRODUCT SECTIONS
↓
MORE STORE CONTENT
↓
FOOTER

The page should have good visual rhythm and should NOT feel like:

Product Grid
Product Grid
Product Grid
Product Grid

Each section should have a clear purpose.

==================================================
21. IMPLEMENTATION PROCESS
==================================================

First inspect the existing storefront implementation and identify:
- Main store page
- Header
- Hero
- Category section
- Product section
- Product card
- Footer
- Responsive styles
- Existing theme/store configuration

Then implement the redesign without breaking functionality.

Do not ask me unnecessary questions.

Make reasonable UI decisions yourself based on the requirements above.

After implementation:
1. Check desktop responsiveness.
2. Check tablet responsiveness.
3. Check mobile responsiveness.
4. Check for horizontal overflow.
5. Check long store names.
6. Check long product names.
7. Check missing product images.
8. Check stores with only 1 category.
9. Check stores with many categories.
10. Check stores with only 1–3 products.
11. Check stores with many products.
12. Check hero with and without image.
13. Check header at mobile sizes.
14. Check all existing interactions still work.

The most important design principle:

FULL-WIDTH BACKGROUNDS WHERE APPROPRIATE
+
CENTERED MAX-WIDTH CONTENT
+
RESPONSIVE COMPONENTS
+
DIFFERENT VISUAL COMPOSITIONS FOR DIFFERENT STORE SECTIONS.

Please implement the redesign directly in the existing codebase rather than only describing what should be changed.
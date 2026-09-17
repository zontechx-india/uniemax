I want to redesign and improve the UnieMax seller storefront customization experience.

This is a major UX improvement, not just a visual polish.

The goal is to transform the current separate:
- Appearance
- Homepage
- Banners
- Footer

configuration experience into a simple, visual and beginner-friendly:

                    STORE BUILDER

The seller should be able to create and customize a professional online store without needing to understand web design.

IMPORTANT:
Do not change existing backend business logic, APIs, database behavior, authentication, product logic, cart logic, order logic, category logic, or existing store functionality unless absolutely required to support the new UI.

First inspect the existing implementation carefully.

Then implement the new UX using the existing architecture/data wherever possible.

============================================================
1. CORE PRODUCT PHILOSOPHY
============================================================

UnieMax is a white-label e-commerce platform.

A seller creates a store using UnieMax.

The seller should NOT feel like they are configuring a website technically.

They should feel like:

"I am designing my store."

The experience should be:

Simple
Visual
Guided
Safe
Fast
Understandable
Professional
Responsive

Avoid exposing unnecessary technical concepts.

Do NOT overwhelm sellers with 30 settings.

Use progressive disclosure:

Simple controls first.
Advanced settings hidden under "More options" or "Advanced".

The default store should already look professional.

The seller should be able to launch a good-looking store without customizing anything.

Customization should be optional.

============================================================
2. CURRENT PROBLEM
============================================================

The current seller navigation contains:

STOREFRONT

Store Details
Business Details
Appearance
Homepage
Banners
Footer

Appearance currently mainly controls colors/templates.

Homepage controls:
- Enable/disable sections
- Reorder sections

Banners separately manages uploaded banners.

This technically works, but the seller has to understand that three different pages control one storefront.

This is not ideal.

We want to unify the experience.

============================================================
3. NEW INFORMATION ARCHITECTURE
============================================================

Change the seller-facing concept to:

STOREFRONT

Store Details
Business Details
Store Builder

The Store Builder becomes the main place to customize the storefront.

Avoid forcing the seller to understand:

"Appearance vs Homepage vs Banners".

Internally, existing modules can remain separate if needed.

The UX should unify them.

For example:

Store Builder
    |
    +-- Design
    |
    +-- Sections
    |
    +-- Banners
    |
    +-- Footer
    |
    +-- Preview

But do not necessarily make these separate navigation pages.

Prefer one integrated workspace.

============================================================
4. STORE BUILDER MAIN SCREEN
============================================================

Create a modern Store Builder workspace.

Recommended desktop structure:

--------------------------------------------------------------
| Store Builder                            [Preview] [Publish]|
--------------------------------------------------------------
|                                                              |
| Sections / Controls          |       LIVE STORE PREVIEW     |
|                              |                              |
| ⋮ Welcome Hero          ⚙    |      Store Header           |
| ⋮ Banners               ⚙    |                              |
| ⋮ Shop by Category      ⚙    |      Hero                   |
| ⋮ Featured Products     ⚙    |                              |
| ⋮ New Arrivals          ⚙    |                              |
| ⋮ Best Sellers          ⚙    |                              |
| ⋮ Category Highlights   ⚙    |      Categories             |
| ⋮ All Products          ⚙    |                              |
|                              |      Products               |
| + Add Section               |                              |
|                              |                              |
--------------------------------------------------------------

The left side controls the structure.

The right side shows the live storefront.

The seller should be able to:

- Reorder sections
- Enable/disable sections
- Click a section
- Customize a section
- Preview changes
- See the result immediately

============================================================
5. IMPORTANT: VISUAL EDITING
============================================================

Where possible, allow the seller to click directly on the preview.

For example:

LIVE STORE PREVIEW

------------------------------------------------
|                                              |
|                 STORE HEADER                 |
|                                      [Edit]  |
------------------------------------------------
|                                              |
|                    HERO                      |
|                                      [Edit]  |
------------------------------------------------
|                                              |
|              SHOP BY CATEGORY                |
|                                      [Edit]  |
------------------------------------------------
|                                              |
|                NEW ARRIVALS                  |
|                                      [Edit]  |
------------------------------------------------

When the seller clicks Edit:

Open a right-side drawer/panel.

Example:

NEW ARRIVALS

Title
[ New Arrivals ]

Subtitle
[ Fresh products just added ]

Layout

[ Grid ] [ Carousel ]

Products
[ Automatic ▼ ]

Show price       ●
Show category    ●

[ Save ]

Advanced options ▼

Do not make the seller navigate to another page for every section.

============================================================
6. STORE BUILDER HEADER
============================================================

Create a clean Store Builder header.

Example:

--------------------------------------------------------------
Store Builder

[ Desktop ] [ Mobile ]

                         [ Preview Store ] [ Publish ]
--------------------------------------------------------------

If useful, include:

- Unsaved changes indicator
- Save status
- Last saved time
- Preview
- Publish

Do not add unnecessary controls.

Publishing should remain clearly separated from saving.

If existing publishing logic exists, preserve it.

============================================================
7. STORE BUILDER LEFT PANEL
============================================================

The left panel should show the storefront structure.

Example:

YOUR STOREFRONT

⋮  Welcome Hero                         ●
⋮  Banners                              ●
⋮  Shop by Category                     ●
⋮  Featured Products                    ●
⋮  New Arrivals                         ●
⋮  Best Sellers                         ●
⋮  Category Highlights                  ●
⋮  All Products                         ●

+ Add Section

Each row should support:

- Drag handle
- Section name
- Enable/disable toggle
- Edit/customize action

Use clear icons.

Do not make the rows too visually heavy.

The currently selected section should be clearly highlighted.

============================================================
8. DRAG AND DROP
============================================================

Preserve the current reorder functionality.

Improve the UX.

Use:

⋮⋮  Welcome Hero
⋮⋮  Banners
⋮⋮  Categories
⋮⋮  New Arrivals

The drag handle should clearly communicate that the item can be moved.

During dragging:
- Show a clear drop position
- Avoid layout jumping
- Keep animation subtle

On mobile, consider a simpler reorder interaction if drag-and-drop is difficult.

Do not break existing ordering persistence.

============================================================
9. ADD SECTION
============================================================

Create:

+ Add Section

When clicked, show a simple section selector.

Example:

ADD SECTION

Store Content

[ Hero ]
[ Banner ]
[ Categories ]
[ Products ]
[ Featured Product ]
[ Collection ]

Marketing

[ Promotion ]
[ Offer Banner ]
[ Brand Story ]

Trust

[ Testimonials ]
[ Store Information ]

Do NOT expose components that are not actually supported by the backend/data.

Only show functionality that can actually work.

If the current system has a fixed set of supported sections, use those.

============================================================
10. SECTION CUSTOMIZATION
============================================================

Every section should have a simple customization panel.

The panel should follow this pattern:

Section name

Basic settings

Visual settings

Content settings

Advanced options

Keep the most common controls visible.

Put uncommon controls under:

"Advanced options"

============================================================
11. HERO CUSTOMIZATION
============================================================

Hero should support multiple presentation styles if the existing architecture can support them.

Potential styles:

1. Minimal
2. Text + Image
3. Full Banner
4. Promotional

Do not implement fake functionality.

Only implement styles that can be represented by the current data model or extend the model cleanly if required.

Example:

HERO

Layout

[ Text + Image ]
[ Full Banner ]
[ Minimal ]

Heading
[ Welcome to our store ]

Description
[ Discover our latest products ]

Primary button
[ Shop Now ]

Image
[ Upload image ]

Button action
[ Shop / Category / Product ]

Advanced options

Spacing
Alignment
Overlay
etc.

The default should already look good.

============================================================
12. BANNER CUSTOMIZATION
============================================================

The existing Banners page should be integrated into Store Builder.

The seller should be able to select the Banners section and manage banners from there.

Example:

BANNERS

[ + Add Banner ]

Banner 1
[ Preview image ]

Destination:
[ Category ▼ ]

Status:
● Active

⋮ Drag

Banner 2
[ Preview image ]

...

If the existing system supports:
- Product links
- Category links
- External URLs

keep those.

Do not remove existing banner functionality.

============================================================
13. BANNER UPLOAD UX
============================================================

Improve the banner upload experience.

Instead of only:

Add Banner

Use a guided flow:

ADD BANNER

Upload your promotional image

[ Drop image here ]
[ Choose image ]

Recommended size:
1920 × 600 (16:5)

Then:

Preview

Link this banner to:

○ Product
○ Category
○ Store page
○ External URL
○ No link

[ Save Banner ]

If image validation already exists, preserve it.

If the existing banner system requires 16:5, continue using that requirement.

However, make the explanation clear and simple.

Do not force sellers to understand technical image terminology.

============================================================
14. PRODUCT SECTION CUSTOMIZATION
============================================================

Product sections are very important.

The current system contains things like:

Featured Products
New Arrivals
Best Sellers
Category Highlights
All Products

Do not make all of these visually identical.

The data can remain similar, but presentation should vary.

Example:

NEW ARRIVALS

Title
[ New Arrivals ]

Subtitle
[ Fresh products just added ]

Layout:

[ Grid ]
[ Carousel ]
[ Horizontal Rail ]

Products:

[ Automatic ]
[ Manually selected ]

Number of products:

[ 4 ]

Display:

☑ Price
☑ Category
☑ Discount
☑ Add to Cart

Advanced options:

Card style
Spacing
etc.

============================================================
15. DIFFERENT VISUAL COMPOSITIONS
============================================================

This is extremely important.

Do not create:

New Arrivals
    ProductGrid

Featured Products
    ProductGrid

Best Sellers
    ProductGrid

Category Highlights
    ProductGrid

All Products
    ProductGrid

This makes every store look repetitive.

Instead, support different presentation components where appropriate:

ProductGrid
ProductCarousel
ProductRail
FeaturedProduct
EditorialProduct
CompactProductList
CategoryProductShowcase

Use them intelligently.

For example:

New Arrivals
→ Product Grid / Carousel

Featured Products
→ Featured layout

Best Sellers
→ Product Rail

Category Highlights
→ Category-based product showcase

All Products
→ Functional product grid

Do not overcomplicate the seller controls.

============================================================
16. CATEGORY SECTION CUSTOMIZATION
============================================================

Example:

SHOP BY CATEGORY

Title
[ Shop by Category ]

Style:

[ Cards ]
[ Image Tiles ]
[ Minimal ]
[ Circular ]

Categories:

☑ Fashion
☑ Electronics
☑ Beauty
☑ Home

If categories are dynamic, use the existing category data.

Do not hardcode category names.

If there are many categories:
- Desktop can show a suitable number
- Mobile should support horizontal scrolling

============================================================
17. ALL PRODUCTS
============================================================

All Products should remain primarily functional.

It should support:

- Product grid
- Search/filter if existing
- Sorting if existing
- Pagination/load more if existing

Do not turn All Products into a decorative section.

============================================================
18. THEME / APPEARANCE
============================================================

Rename the conceptual "Template" functionality if it only changes colors.

If a template changes only colors, call it:

Color Theme

not:

Template

A true Template should eventually be capable of changing:

- Header style
- Hero composition
- Product card style
- Category presentation
- Typography
- Button style
- Spacing
- Overall visual composition

For the current implementation, do not invent unsupported functionality.

But structure the UI so this can evolve later.

Recommended:

STORE DESIGN

Theme

[ Modern ]
[ Minimal ]
[ Classic ]

Brand Colors

Primary
[ color ]

Secondary
[ color ]

Background
[ color ]

Text
[ color ]

Typography

[ Modern ]
[ Clean ]
[ Classic ]

If the current system only supports colors, make that clear.

============================================================
19. DEFAULT STORE EXPERIENCE
============================================================

This is one of the most important product decisions.

When a seller creates a store, do NOT make them build the homepage from scratch.

Automatically create a professional default structure.

Example:

Welcome Hero
↓
Banners
↓
Shop by Category
↓
Featured Products
↓
New Arrivals
↓
Best Sellers
↓
Category Highlights
↓
All Products

The seller can then:

- Keep it
- Reorder it
- Disable sections
- Customize sections

The seller should be able to launch without touching the builder.

The philosophy should be:

"UnieMax builds the first version for you."

============================================================
20. STORE SETUP EXPERIENCE
============================================================

When a new store is created, provide a setup checklist.

Example:

YOUR STORE

✓ Store details
✓ Products
✓ Categories

Customize your storefront

○ Choose a theme
○ Add a banner
○ Preview your store
○ Publish your store

But do not block publishing unnecessarily unless the existing business rules require it.

============================================================
21. QUICK CUSTOMIZE
============================================================

Every section should support a simple "Quick Customize" experience.

Example:

------------------------------------------------
NEW ARRIVALS

Title
[ New Arrivals ]

Layout

[ Grid ] [ Carousel ]

Products
[ Automatic ▼ ]

Show:
☑ Price
☑ Category

[ Save ]

More options ▼
------------------------------------------------

This should be the default.

Do not expose every possible setting immediately.

============================================================
22. ADVANCED OPTIONS
============================================================

Use progressive disclosure.

Example:

More options ▼

When expanded:

Card ratio
Section spacing
Text alignment
Number of products
Mobile behavior
etc.

Only include options that are actually supported.

Avoid creating configuration complexity for the sake of flexibility.

============================================================
23. LIVE PREVIEW
============================================================

The preview is one of the most important parts.

The seller should see the actual storefront.

Preview should update as changes are made.

At minimum support:

[ Desktop ]
[ Mobile ]

Potentially:

[ Desktop ] [ Tablet ] [ Mobile ]

The preview should use the real store data.

Do not create a fake demo preview disconnected from the actual storefront.

============================================================
24. RESPONSIVE BUILDER
============================================================

The Store Builder itself must also be responsive.

Desktop:

----------------------------------------------------
| Controls                 | Preview               |
----------------------------------------------------

Tablet:

----------------------------------------------------
| Controls / Preview                                |
----------------------------------------------------

Mobile:

----------------------------------------------------
| Store Builder                                     |
|                                                   |
| [ Preview Store ]                                 |
|                                                   |
| Sections                                           |
| ⋮ Hero                                    ●       |
| ⋮ Banner                                  ●       |
| ⋮ Categories                              ●       |
|                                                   |
| + Add Section                                     |
----------------------------------------------------

Do not try to display a desktop two-column builder unchanged on mobile.

============================================================
25. STORE PREVIEW RESPONSIVENESS
============================================================

The actual storefront must be responsive for:

320px
360px
375px
390px
412px
430px
480px
768px
834px
1024px
1280px
1366px
1440px
1536px
1920px
2560px

No horizontal overflow.

============================================================
26. STOREFRONT WIDTH
============================================================

Use the principle:

FULL-WIDTH BACKGROUND
+
CENTERED MAX-WIDTH CONTENT

Recommended:

max-width: approximately 1440px

with responsive horizontal padding.

For example:

.store-container {
  width: 100%;
  max-width: 1440px;
  margin-inline: auto;
  padding-inline: 24px;
}

Adjust based on the existing project/design system.

Do not allow content to stretch indefinitely on 1920px/2560px screens.

Hero backgrounds and promotional backgrounds may be full width.

Actual content should remain constrained.

============================================================
27. STOREFRONT HEADER
============================================================

Preserve current functionality:

- Logo
- Store name
- Home
- Shop
- Categories
- Help
- Search
- Share
- Cart
- Sign in/account

Improve:

- Spacing
- Typography
- Alignment
- Responsive behavior
- Long store name handling
- Mobile navigation

Desktop:
Use max-width inner content.

Mobile:

Top row:
[ Menu ] [ Logo/Store Name ] [ Cart ]

Second row:
[ Search ]

Do not squeeze desktop navigation onto mobile.

============================================================
28. STOREFRONT HERO
============================================================

The current store page has a lot of empty space because the hero is mostly text.

Improve this.

With visual content:

------------------------------------------------------------
| WELCOME TO                    |                         |
|                               | Store image             |
| Store Name                    |                         |
| Store description             |                         |
|                               |                         |
| [ Start Shopping ]            |                         |
------------------------------------------------------------

Without image:

Use a balanced text-focused hero.

Do NOT leave a huge empty right side.

The hero should feel intentional even without seller-uploaded artwork.

============================================================
29. STOREFRONT PRODUCT CARDS
============================================================

Create a modern consistent product card.

Example:

------------------------------------------------
|                                      ♡       |
|                                              |
|              PRODUCT IMAGE                   |
|                                              |
------------------------------------------------
| CATEGORY                                     |
| Product Name                                 |
|                                              |
| ₹1,74,990                                    |
| Discount / offer                             |
------------------------------------------------

Requirements:

- Consistent image ratio
- Correct object-fit
- Missing image state
- Long product name handling
- Strong price hierarchy
- Optional category
- Optional discount
- Existing cart functionality preserved
- Desktop hover interaction
- Mobile touch-friendly behavior

Avoid excessive shadows.

Avoid excessive borders.

Avoid random card sizes.

============================================================
30. MISSING PRODUCT IMAGES
============================================================

Current product cards can show a basic cube placeholder.

Improve this visually.

Use a clean neutral placeholder.

It should look intentional, not broken.

Example:

Soft neutral background
+
simple image/product icon
+
center alignment

============================================================
31. PRODUCT GRID RESPONSIVENESS
============================================================

Desktop:
4–5 products depending on width.

Tablet:
3 products.

Mobile:
2 products.

Do not make product cards extremely wide on large monitors just to fill space.

Use CSS Grid/Flexbox.

No fixed positioning.

============================================================
32. STORE IDENTITY
============================================================

The store should feel like the seller owns a real branded store.

Where appropriate, show:

Store logo
Store name
Short description
Optional business information

Example:

[ Store Logo ]

UNICON SOLUTIONS

Apple Private Service Provider

Computers • Accessories

[ Shop Now ]

Do not invent verification badges or claims.

Only display information supported by the existing data.

============================================================
33. FOOTER
============================================================

Bring Footer customization into Store Builder.

The seller should be able to configure:

- Footer visibility
- Store information
- Navigation links
- Categories
- Contact information
- Social links
- Legal links

Only expose existing supported data.

Do not invent unsupported fields.

============================================================
34. STORE BUILDER NAVIGATION
============================================================

I prefer this simplified navigation:

STOREFRONT

Store Details
Business Details
Store Builder

The Store Builder can contain:

Design
Sections
Banners
Footer
Preview

Do not force the seller to navigate to:

Appearance
Homepage
Banners
Footer

separately.

============================================================
35. PUBLISHING
============================================================

Publishing should remain highly visible.

Example:

[ Preview Store ] [ Publish ]

If there are required setup steps, clearly explain them.

Example:

Your store is almost ready.

✓ Products
✓ Store details
✓ Categories
○ Business details

[ Complete setup ]

But do not make the builder confusing because of setup validation.

Preserve existing publish rules.

============================================================
36. UNSAVED CHANGES
============================================================

Handle unsaved changes clearly.

Example:

Unsaved changes

[ Discard ] [ Save ]

If the existing system autosaves, use:

Saving...
Saved ✓

Do not silently lose changes.

============================================================
37. RESET / UNDO SAFETY
============================================================

For destructive actions:

- Removing a section
- Resetting theme
- Resetting layout

Use confirmation where appropriate.

For example:

Remove "Featured Products"?

This section will be removed from your homepage.

[ Cancel ] [ Remove ]

If practical, provide Undo after removal.

============================================================
38. BEGINNER EXPERIENCE
============================================================

A first-time seller should be able to understand the builder without documentation.

Use short explanations.

Good:

"Show products you've marked as Featured."

Bad:

"Configure merchandising entity rendering behavior."

Keep language simple.

============================================================
39. EMPTY STATES
============================================================

Every section must handle empty data gracefully.

Example:

Featured Products

No featured products yet.

[ Select Products ]

Do not render:

- Huge blank spaces
- Broken cards
- Empty grids
- Broken images

For automatic sections:

"Products will appear here automatically when available."

============================================================
40. FEW PRODUCTS
============================================================

The store must look good with:

1 product
2 products
3 products

Do not stretch cards unnecessarily.

Do not create huge empty grid spaces.

Example:

1 product:

[ Product ]

not:

[ Product ] [ gigantic empty card ] [ gigantic empty card ]

============================================================
41. MANY PRODUCTS
============================================================

The store must also work with hundreds/thousands of products.

Do not render unnecessarily huge amounts of DOM content.

Use existing pagination/lazy loading/carousel behavior where appropriate.

============================================================
42. MANY CATEGORIES
============================================================

If a seller has many categories:

Desktop:
Show a reasonable number.

Mobile:
Horizontal scrolling.

Do not make the homepage 5 screens tall just because there are many categories.

============================================================
43. THEME SYSTEM ARCHITECTURE
============================================================

Keep the storefront architecture theme-driven.

Conceptually:

Store
 |
 +-- Theme
 |
 +-- Sections
 |     |
 |     +-- Hero
 |     +-- Banner
 |     +-- Categories
 |     +-- Products
 |     +-- Featured
 |     +-- New Arrivals
 |     +-- Best Sellers
 |     +-- Category Highlights
 |     +-- All Products
 |
 +-- Footer

The same store data should be rendered differently depending on theme/section configuration.

Do not hardcode seller-specific layouts.

============================================================
44. COMPONENT ARCHITECTURE
============================================================

Prefer reusable components.

Potential structure:

StoreBuilder
 ├── BuilderHeader
 ├── SectionList
 │    ├── SectionItem
 │    └── AddSection
 ├── SectionEditor
 └── StorePreview

SectionEditor
 ├── HeroEditor
 ├── BannerEditor
 ├── CategoryEditor
 ├── ProductSectionEditor
 └── FooterEditor

StorePreview
 ├── StoreHeader
 ├── HeroSection
 ├── BannerSection
 ├── CategorySection
 ├── ProductSection
 ├── Footer
 └── ...

Adapt this to the existing codebase rather than blindly creating this exact structure.

============================================================
45. IMPORTANT: DO NOT BREAK EXISTING DATA
============================================================

Before changing anything, inspect:

- Existing API responses
- Existing TypeScript interfaces/types
- Existing store configuration
- Existing section configuration
- Existing banner model
- Existing theme model
- Existing product model
- Existing category model
- Existing homepage persistence
- Existing publish flow

Do not rename API fields unnecessarily.

Do not break existing saved stores.

Existing stores must continue rendering.

If a migration is required, make it backward compatible.

============================================================
46. BACKWARD COMPATIBILITY
============================================================

Existing stores may already have:

- Homepage section order
- Enabled/disabled state
- Theme colors
- Banners
- Footer configuration

The new Store Builder must load these existing settings correctly.

Do not reset existing seller stores.

If new fields are introduced, provide safe defaults.

============================================================
47. NO FAKE DATA
============================================================

Do not add fake products.

Do not add fake seller information.

Do not add fake analytics.

Do not add fake reviews.

Do not add fake testimonials.

Use actual store data.

For UI preview, use existing real data where possible.

============================================================
48. ACCESSIBILITY
============================================================

The builder and storefront must support:

- Keyboard navigation
- Visible focus states
- Semantic HTML
- Accessible buttons
- Accessible icon buttons
- Proper labels
- Proper image alt text
- Sufficient contrast
- Touch-friendly controls

============================================================
49. PERFORMANCE
============================================================

Do not make the builder heavy.

Be careful with:

- Live preview rendering
- Large images
- Product lists
- Drag/drop
- Re-rendering
- State synchronization

Avoid unnecessary API calls when editing.

Use existing caching/state mechanisms where available.

============================================================
50. RESPONSIVE STOREFRONT DESIGN
============================================================

The final storefront should follow:

Desktop:

Full-width background
+
1440px max-width content

Tablet:

Reduced padding
+
3-column product layouts where appropriate

Mobile:

Mobile header
+
stacked hero
+
horizontal category scrolling
+
2-column product grid
+
compact section spacing

No horizontal overflow.

============================================================
51. VISUAL DESIGN LANGUAGE
============================================================

Use a clean modern design system.

Characteristics:

- Premium
- Minimal
- Professional
- Soft borders
- Controlled shadows
- Consistent radius
- Good whitespace
- Strong typography
- Clear CTAs

Do not overuse:

- Gradients
- Shadows
- Animations
- Borders
- Colors
- Rounded cards everywhere

The design should work with different seller brand colors.

============================================================
52. SELLER BRAND COLORS
============================================================

UnieMax should provide the base design system.

Seller colors should be applied through theme variables/design tokens.

Do not hardcode colors into individual components.

Conceptually:

--primary
--secondary
--background
--surface
--text
--muted
--border

This allows one theme to work across the entire store.

============================================================
53. IMPORTANT: TEMPLATE VS COMPONENT CUSTOMIZATION
============================================================

The system should eventually support two levels:

LEVEL 1:
Choose a complete visual theme.

Example:

Modern
Minimal
Classic

LEVEL 2:
Customize individual sections.

Example:

Hero:
Text + Image

Products:
Grid

Categories:
Cards

This is better than making sellers configure every detail manually.

The theme provides the starting point.

The builder provides control.

============================================================
54. PRESET EXPERIENCE
============================================================

When choosing a theme:

Example:

MODERN

[ Preview ]

Description:
Clean layouts with strong product presentation.

[ Use this theme ]

Then the seller can customize.

Do not force the seller through 20 configuration screens.

============================================================
55. "YOU DON'T HAVE TO DESIGN" PHILOSOPHY
============================================================

The seller should never feel:

"I don't know how to design a website."

Instead:

"UnieMax already designed it for me. I can change it if I want."

This should guide every UI decision.

============================================================
56. MOBILE BUILDER
============================================================

On mobile, prioritize:

Store Builder
Sections
Section editing

Recommended:

------------------------------------------------
Store Builder

[ Preview Store ]

YOUR STOREFRONT

⋮ Hero                         ●
⋮ Banners                      ●
⋮ Categories                   ●
⋮ New Arrivals                 ●
⋮ Featured                     ●

+ Add Section
------------------------------------------------

Clicking a section opens a bottom sheet or full-screen editor.

Do not use tiny desktop dialogs on mobile.

============================================================
57. STORE PREVIEW
============================================================

Preview should preferably open in:

- New tab/window
OR
- Full-screen preview

Do not trap the seller inside a tiny preview.

Existing "Open full preview" functionality can be preserved/improved.

============================================================
58. FINAL STOREFRONT INFORMATION ARCHITECTURE
============================================================

The storefront should generally look like:

HEADER
↓
HERO / STORE IDENTITY
↓
BANNERS (optional)
↓
SHOP BY CATEGORY
↓
FEATURED PRODUCTS
↓
NEW ARRIVALS
↓
BEST SELLERS
↓
CATEGORY HIGHLIGHTS
↓
ALL PRODUCTS
↓
FOOTER

But section order must remain configurable.

Do not hardcode this order if the existing system allows reordering.

============================================================
59. DIFFERENT STORE TYPES
============================================================

The same Store Builder must work for:

Fashion
Electronics
Grocery
Beauty
Home & Kitchen
General Retail
Accessories
Other categories

Do not hardcode one visual style for one business type.

The theme and section composition should make the store adaptable.

============================================================
60. FINAL USER JOURNEY
============================================================

A new seller should experience:

CREATE STORE
      ↓
ADD PRODUCTS
      ↓
ADD CATEGORIES
      ↓
STORE CREATED
      ↓
UnieMax automatically creates a beautiful storefront
      ↓
Seller opens Store Builder
      ↓
Optional:
Choose theme
      ↓
Optional:
Customize sections
      ↓
Preview
      ↓
Publish

The seller should NOT be required to manually build everything.

============================================================
61. DESIGN PRIORITY
============================================================

Prioritize in this order:

1. Ease of use
2. Clear visual hierarchy
3. Professional storefront
4. Responsive behavior
5. Customization flexibility
6. Performance
7. Advanced customization

Never sacrifice simplicity just to provide more configuration options.

============================================================
62. DO NOT OVERENGINEER
============================================================

Do not turn this into a Figma-like website builder.

UnieMax is an e-commerce platform.

The seller needs to manage a store, not design a website from scratch.

Therefore:

GOOD:

[ Grid ]
[ Carousel ]

GOOD:

[ Modern ]
[ Minimal ]

GOOD:

Show price ●

BAD:

20 spacing controls
20 typography controls
CSS editor
Complex drag-and-drop canvas
Pixel positioning
Manual breakpoint configuration

Keep it simple.

============================================================
63. IMPLEMENTATION STRATEGY
============================================================

Before coding:

1. Inspect the existing project.
2. Identify the current Storefront pages.
3. Identify the current Homepage configuration.
4. Identify the Appearance implementation.
5. Identify the Banner implementation.
6. Identify the Footer implementation.
7. Identify how configuration is stored.
8. Identify how preview works.
9. Identify existing reusable components.
10. Identify existing theme variables.

Then design the new Store Builder around the existing system.

Do not rewrite unrelated parts of the application.

============================================================
64. IMPORTANT: EXISTING STORES
============================================================

Test with the existing ZoneMax/Unicon Solutions style store data.

Make sure:

- Existing products appear
- Existing categories appear
- Existing banners appear
- Existing theme colors appear
- Existing section order appears
- Existing enabled/disabled states appear
- Existing footer data appears
- Existing store URL works
- Existing cart works
- Existing navigation works

============================================================
65. TEST CASES
============================================================

Test at least these cases:

CASE 1:
Store with 1 category and 3 products.

CASE 2:
Store with 5 categories and 20 products.

CASE 3:
Store with 20+ categories.

CASE 4:
Store with no banner.

CASE 5:
Store with one banner.

CASE 6:
Store with multiple banners.

CASE 7:
Store without hero image.

CASE 8:
Store with hero image.

CASE 9:
Long store name.

CASE 10:
Long product name.

CASE 11:
Missing product image.

CASE 12:
Mobile 320px width.

CASE 13:
Mobile 390px width.

CASE 14:
Tablet 768px.

CASE 15:
Desktop 1440px.

CASE 16:
Large desktop 1920px.

CASE 17:
Very large desktop 2560px.

============================================================
66. FINAL QUALITY CHECK
============================================================

Before considering the implementation complete, verify:

- No horizontal overflow
- No broken images
- No layout jumps
- No console errors
- No broken API calls
- No broken navigation
- No broken cart
- No broken preview
- No broken publishing
- No lost existing settings
- No fake data
- No hardcoded seller data
- Responsive design works
- Existing stores still work
- New stores get sensible defaults

============================================================
67. SUCCESS CRITERIA
============================================================

The final result should make a seller think:

"I can create my store easily."

NOT:

"I need to learn how this configuration system works."

The seller should be able to:

1. Create a store.
2. See a professional default design.
3. Open Store Builder.
4. See all sections visually.
5. Drag sections to reorder.
6. Turn sections on/off.
7. Click a section.
8. Quickly customize it.
9. Upload a banner.
10. Change the theme.
11. Preview desktop/mobile.
12. Publish.

All without needing technical knowledge.

============================================================
68. MOST IMPORTANT FINAL PRINCIPLE
============================================================

Build UnieMax Store Builder around this idea:

                  "START BEAUTIFUL.
                   CUSTOMIZE EASILY."

UnieMax should automatically make good design decisions.

The seller should only need to make business decisions.

For example:

UnieMax decides:
- Spacing
- Responsive behavior
- Grid behavior
- Typography scale
- Card proportions
- Mobile layout
- Section composition

Seller decides:
- Store name
- Products
- Categories
- Banner
- Theme
- Which sections to show
- Section order
- Simple visual preferences

This is the experience I want.

============================================================
69. IMPLEMENT DIRECTLY
============================================================

Do not just explain the changes.

Implement them in the existing codebase.

Before making major architectural changes, inspect the existing implementation and reuse it wherever possible.

Do not ask unnecessary clarification questions.

Make reasonable decisions yourself based on this specification.

When finished, provide a concise summary of:

- What was changed
- Which existing components were reused
- Which new components were created
- Any database/API changes
- Any migration needed
- Any remaining limitations

Most importantly, make the result feel like a polished commercial SaaS product, not an internal admin configuration screen.
# UnieMax — Store Share Kit: Phase 1

## Goal

Build a simple, beautiful, professional **Store Share Kit** feature for sellers in the UnieMax seller/admin dashboard.

The purpose is to allow a seller to easily share their online store through:

- QR Code
- WhatsApp
- Instagram
- Direct store link

The feature should feel like a polished SaaS product, not a basic QR-code generator.

---

# Phase 1 Scope

Implement only the following:

1. Store QR Code generator
2. Store logo inside QR Code
3. 3 professional share-card templates
4. Instagram Post image generation
5. Instagram Story image generation
6. WhatsApp sharing
7. Copy Store Link
8. Live preview while customizing

Do not implement analytics, QR tracking, posters, business cards, or advanced social-media features in Phase 1.

---

# 1. Store Share Kit Page

Add a new seller dashboard page:

**Store → Share Your Store**

or:

**Marketing → Store Share Kit**

The page should have a clean two-column layout on desktop.

### Left

Live preview of the selected design.

### Right

Customization controls.

Example:

```text
--------------------------------------------------
|                                                |
|  Share Your Store                              |
|  Create a beautiful store card to share       |
|  your store everywhere.                       |
|                                                |
|  ┌──────────────────┐   ┌──────────────────┐  |
|  │                  │   │ Template         │  |
|  │                  │   │                  │  |
|  │     PREVIEW      │   │ ○ Minimal        │  |
|  │                  │   │ ○ Brand          │  |
|  │      [ QR ]      │   │ ○ Product        │  |
|  │                  │   │                  │  |
|  │    Scan to Shop  │   │ QR Style         │  |
|  │                  │   │ [Brand]          │  |
|  │                  │   │                  │  |
|  │                  │   │ [Download]       │  |
|  └──────────────────┘   └──────────────────┘  |
|                                                |
--------------------------------------------------
```

The UI should be responsive and work well on mobile and desktop.

---

# 2. Store Information

Use the existing store information from the application.

The generated design should automatically use:

- Store name
- Store logo
- Store URL
- Store primary/brand color if available
- Store description if available
- Optional Instagram username if already stored

Do not create duplicate store information fields if the existing store model already contains these values.

Reuse the existing store/theme configuration.

---

# 3. Store URL

The QR Code must point directly to the seller's public store.

Example:

```text
https://store-name.uniemax.com
```

Use the existing URL-generation logic from the application if one already exists.

Do not hardcode URLs.

The same URL should be displayed in the Share Kit.

Provide:

**Copy Store Link**

After copying:

```text
✓ Link copied
```

Use a toast/snackbar rather than an intrusive popup.

---

# 4. QR Code

Generate a high-quality QR code for the store URL.

Requirements:

- High resolution
- Good contrast
- Proper quiet zone
- Scannable on mobile
- Support PNG download
- Support SVG download if practical
- Rounded/modern appearance where technically safe
- Store logo in the center

The logo should be small enough that it does not affect QR scanning.

Provide QR customization:

### QR Style

- Classic
- Brand
- Rounded

### Caption

Default:

**Scan to Shop**

Optional presets:

- Scan to Shop
- Visit Our Store
- Shop Now
- Explore Store

Do not allow colors that produce poor QR contrast.

---

# 5. Three Templates

Create exactly 3 initial templates.

## Template 1 — Minimal

Style:

- Clean
- White/neutral background
- Large QR
- Store logo
- Store name
- "Scan to Shop"
- Store URL

Example:

```text
        [LOGO]

       STORE NAME

     Shop online with us

        [ QR CODE ]

       Scan to Shop

   store-name.uniemax.com
```

This should look premium and minimal.

---

## Template 2 — Brand

Use the seller's primary brand color.

Example:

```text
┌────────────────────────┐

        [LOGO]

       STORE NAME

    Your store, online.

        [ QR ]

      SCAN TO SHOP

   store-name.uniemax.com

└────────────────────────┘
```

Use the existing store branding where possible.

Do not introduce random colors.

---

## Template 3 — Product

Use one selected product image.

Allow the seller to select one product from their store.

Layout:

```text
┌────────────────────────┐

       [PRODUCT IMAGE]

       SHOP NOW

       STORE NAME

         [ QR ]

      Scan to Shop

└────────────────────────┘
```

If the seller does not select a product, use the store logo/brand image instead.

The product selection UI should be simple.

---

# 6. Live Preview

The preview must update immediately when the seller changes:

- Template
- QR style
- Store color
- Caption
- Product
- Logo

Avoid requiring a "Generate" button for every change.

The user should see the final result before downloading.

---

# 7. Instagram Post

Add:

### Instagram Post

Generate:

**1080 × 1350 px**

Use the selected template and customization.

The output should be a downloadable image.

Button:

**Download Instagram Post**

The generated image should contain:

- Store logo
- Store name
- QR
- Store URL
- CTA
- Product image if Product template is selected

Make sure text is readable and the QR is large enough to scan.

---

# 8. Instagram Story

Generate:

**1080 × 1920 px**

Button:

**Download Instagram Story**

Design should be optimized for the vertical format.

Keep important information away from the extreme top and bottom areas because Instagram UI may overlap those areas.

The QR should remain large and easy to scan.

---

# 9. WhatsApp

Add:

**Share on WhatsApp**

Use the standard WhatsApp share mechanism.

The shared message should contain:

```text
🛍️ Shop from our online store

Discover our latest products and offers.

👉 {STORE_URL}
```

Do not create a custom WhatsApp integration.

Use the normal WhatsApp sharing/deep-link mechanism supported by the web application.

---

# 10. Store Link Sharing

Add:

**Copy Link**

and:

**Share Store**

The Share Store button should use the browser's native Web Share API when supported.

Fallback:

- Copy store link

---

# 11. Design Requirements

The feature should look like a modern SaaS product.

Design principles:

- Clean
- Minimal
- Premium
- Spacious
- Rounded cards
- Soft borders
- Good typography
- Clear hierarchy
- Subtle animations
- No unnecessary gradients
- No excessive shadows
- No clutter

Use the existing UnieMax design system and Tailwind configuration.

Do not introduce a completely different visual language.

---

# 12. Technical Requirements

Before implementing:

1. Inspect the existing codebase.
2. Understand the existing store model.
3. Find how public store URLs are generated.
4. Find existing store branding/theme configuration.
5. Reuse existing UI components.
6. Reuse existing API patterns.
7. Follow the existing project architecture.

Do not unnecessarily modify existing backend architecture.

If an API is required, follow the existing:

```text
modules/
  <module>/
    schema
    service
    controller
    routes
```

architecture.

Use existing validation patterns such as Zod.

---

# 13. Image Generation

The Instagram images should be generated client-side if practical.

Prefer a maintainable approach that allows the same template configuration to generate:

- Live preview
- Instagram Post
- Instagram Story

Do not duplicate the template rendering logic unnecessarily.

If the project already has a suitable image/canvas generation library, evaluate and reuse it.

Otherwise choose a lightweight, reliable solution.

---

# 14. Important QR Requirements

The QR code is the most important functional element.

Before finalizing the implementation, verify:

- QR scans correctly from the generated image
- QR scans correctly from the live preview
- Logo does not break scanning
- Brand colors maintain sufficient contrast
- Downloaded image maintains QR quality
- Instagram image compression does not make the QR unusable

Keep sufficient padding around the QR.

---

# 15. Error Handling

Handle:

- Store URL unavailable
- Store logo unavailable
- Product image unavailable
- QR generation failure
- Image generation failure
- Browser does not support Web Share
- Clipboard permission failure

Show user-friendly error messages.

Do not expose technical errors to the seller.

---

# 16. Mobile UI

The seller dashboard is likely to be used from mobile as well.

On mobile:

```text
Share Your Store

[ Preview ]

Template
[ Minimal ] [ Brand ] [ Product ]

QR Style
[ Classic ] [ Brand ] [ Rounded ]

Caption
[ Scan to Shop ]

[ Download ]

[ Share on WhatsApp ]

[ Copy Store Link ]
```

The preview should appear before the controls.

---

# 17. Do Not Build Yet

Do NOT implement these in Phase 1:

- QR analytics
- Scan tracking
- UTM tracking
- QR campaigns
- A4 posters
- Business cards
- Sticker generation
- Facebook templates
- Multiple product layouts
- Advanced template editor
- Drag-and-drop editor
- AI-generated designs
- Social media analytics

These can be Phase 2+ features.

---

# 18. Acceptance Criteria

Phase 1 is complete when a seller can:

1. Open **Store Share Kit**
2. See their store information automatically populated
3. See a QR code for their store
4. See their store logo inside the QR
5. Switch between 3 templates
6. Customize QR style
7. Change the CTA/caption
8. Select a product for the Product template
9. See changes immediately in preview
10. Download Instagram Post (1080×1350)
11. Download Instagram Story (1080×1920)
12. Share the store through WhatsApp
13. Copy the store URL
14. Share the store using native browser sharing
15. Scan the downloaded QR successfully

---

# Development Approach

Do not start coding immediately.

First inspect the existing project and provide:

### Step 1 — Existing Architecture

Identify:

- Frontend structure
- Store model
- Store API
- Store URL generation
- Theme/branding system
- Existing reusable components
- Existing image handling

### Step 2 — Implementation Plan

Explain:

- Files that need to be created
- Files that need modification
- Required dependencies
- Whether backend changes are required
- How image generation will work
- How QR generation will work

### Step 3 — Implement

After understanding the existing architecture, implement Phase 1 following the existing project conventions.

Avoid unnecessary refactoring.

### Step 4 — Test

Test:

- Desktop
- Mobile
- QR scanning
- Downloaded images
- Different store logos
- Different brand colors
- Product image missing
- Long store names
- Long store URLs
- Missing optional data

### Step 5 — Final Report

Provide:

- Files changed
- Dependencies added
- API changes
- Database changes, if any
- How to test
- Known limitations
- Recommended Phase 2 improvements
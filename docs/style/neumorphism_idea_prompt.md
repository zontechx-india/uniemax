# Design style: "Soft Neumorphism + Titanium" cards

Build cards in a soft neumorphic style. Surfaces look like they are pressed out of the
screen, or pressed into it. Light always comes from the TOP-LEFT:
- a light shadow on the top-left edge
- a dark shadow on the bottom-right edge
- a thin inner highlight line on the top-left rim
When pressed, the outer shadows become inset (inner) shadows, so the surface "sinks in".
Never use borders on these surfaces. The depth comes only from shadows and a 145° gradient.

## Base palette (light mode)
- Screen background: #F2F2F7 (iOS system gray. Never pure white, or the light shadow disappears.)
- Alternate section band: #EAEAEF
- Carbon / shadow tint: #1C1C1E
- Brand (orange): #FF7A00
- Accent (yellow): #FFC400
- Text: #000000, muted text: #6E6E73
Dark mode: background #000000, card #1C1C1E, text #FFFFFF, muted #8E8E93.

---

## 1. Titanium hero card (e.g. "Become a Service Provider" / "Manage your services")
A space-gray metal card. Its face looks the SAME in light and dark mode. Only the outer shadow changes.

- Radius 24, padding 16, side margin 16
- Face: linear-gradient(145deg, #5C5C63 0%, #404046 100%)
- Shadow (light mode):
  6px 6px 14px rgba(28,28,30,0.16), -6px -6px 14px rgba(255,255,255,0.95), inset 1px 1px 0 rgba(255,255,255,0.22)
- Shadow (dark mode):
  6px 6px 14px rgba(0,0,0,0.6), -6px -6px 14px rgba(255,255,255,0.06), inset 1px 1px 0 rgba(255,255,255,0.22)
- Pressed (when the whole card is tappable):
  inset 4px 4px 10px rgba(0,0,0,0.45), inset -4px -4px 10px rgba(255,255,255,0.16)

Layout, top to bottom:
1. Row (gap 12, centered vertically):
   - Round icon badge 44×44, pressed INTO the metal:
     fill #4A4A50, shadow inset 3px 3px 6px rgba(0,0,0,0.45), inset -3px -3px 6px rgba(255,255,255,0.16).
     Icon 20px in the brand orange #FF7A00.
   - Text column:
     - Small label "FOR PROVIDERS": 11px, weight 700, UPPERCASE, letter-spacing 0.88, color #FFD340
       (accent mixed toward white), margin-bottom 2
     - Title: 17px, weight 700, letter-spacing -0.17, white
2. Body text: 13px, line-height 18.85, rgba(255,255,255,0.8), margin-top 10, margin-bottom 14
3. Full-width "raised key" button (section 2)

Copy examples:
- New user: label "For providers" · title "Have a skill? Offer it here" ·
  body "List your service free and get bookings from people nearby." · button "Become a Service Provider →"
- Existing provider: title "Manage your services" ·
  body "Handle requests, bookings and earnings in one place." · button "Open Provider Dashboard →"

## 2. Raised orange key (the button on the titanium card)
- Height 42, pill radius 21, row with gap 6, centered, text + right arrow icon 16px
- Face: linear-gradient(145deg, #FF922E 0%, #FF7A00 100%)
- Shadow: 4px 4px 10px rgba(0,0,0,0.35), -3px -3px 8px rgba(255,255,255,0.07), inset 1px 1px 0 rgba(255,255,255,0.45)
- Pressed: inset 3px 3px 8px rgba(110,45,0,0.45), inset -3px -3px 8px rgba(255,220,180,0.35)
- Text: 14px, weight 700, white

## 3. Soft neumorphic tile (e.g. "Popular categories" grid item)
Grid: 4 columns, column gap 10, row gap 14, side padding 16 (leave room for the shadows).
Tile width = (screenWidth − 32 − 30) / 4. Show 7 categories + a "View all" tile.

Tile:
- Radius 16, padding 10 top/bottom and 4 left/right, items centered, gap 8
- Face (light): linear-gradient(145deg, #FAFAFC, #E8E8ED)
- Face (dark):  linear-gradient(145deg, #373739, #1C1C1E)  (uses the card color, because soft shadows don't show on black)
- Shadow (light):
  5px 5px 12px rgba(28,28,30,0.14), -5px -5px 12px rgba(255,255,255,0.95),
  inset 1px 1px 0 rgba(255,255,255,0.9), inset -1px -1px 0 rgba(0,0,0,0.04)
- Shadow (dark):
  5px 5px 12px rgba(0,0,0,0.9), -4px -4px 10px rgba(255,255,255,0.06), inset 1px 1px 0 rgba(255,255,255,0.08)
- Pressed (light): inset 4px 4px 9px rgba(28,28,30,0.14), inset -4px -4px 9px rgba(255,255,255,0.95)
- Pressed (dark):  inset 4px 4px 9px rgba(0,0,0,0.9), inset -4px -4px 9px rgba(255,255,255,0.06)

Inside the tile:
- Round icon well 44×44 (radius 22), pressed into the face:
  - Fill: light #E8E8ED, dark #1C1C1E
  - Shadow (light): inset 2px 2px 4px rgba(28,28,30,0.14), inset -2px -2px 4px rgba(255,255,255,0.95), 0 1px 4px rgba(0,0,0,0.18)
  - Shadow (dark):  inset 2px 2px 4px rgba(0,0,0,0.9), inset -2px -2px 4px rgba(255,255,255,0.06), 0 1px 4px rgba(0,0,0,0.18)
  - Icon 22px: light #D96800 (brand made a bit darker), dark #FF7A00. "View all" uses a gray "more" icon.
- Name: 12px, line-height 14.4, weight 500, centered, max 2 lines, main text color

## Rules
- Neumorphic tiles must sit on the gray background (#F2F2F7 or #EAEAEF), never on white.
- Keep brand orange for icons, the main button and small highlights. Don't fill big areas with it.
- Every tappable neumorphic surface swaps its outer shadow for its "Pressed" inset shadow while pressed.
- Put all colors and shadows in theme tokens (for example titaniumFace, titaniumShadow, raisedKeyFace,
  neuTileFace, neuTileShadow, neuTilePressedShadow, neuBadgeFill, neuBadgeShadow). Don't hardcode them in components.

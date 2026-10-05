# Design Guidelines

This document defines the UI/UX standards for this project.

Whenever creating, modifying, or reviewing any UI, always refer to this
document before making design decisions.

---

## 1. Overall Design Direction

The application should feel:

- Modern
- Premium
- Clean
- Professional
- Simple
- Trustworthy
- Easy to use
- Production-ready

Avoid designs that look like generic AI-generated templates.

The UI should feel intentionally designed for a real SaaS/product application.

---

## 2. Design Inspiration

Use the following products only as general design inspiration:

- Linear — clean SaaS interface and excellent spacing
- Stripe — professional typography, forms and visual hierarchy
- Vercel — minimal design and strong typography
- Notion — simple and functional UX

Do NOT copy their designs.

Use them only as inspiration for:

- Visual quality
- Spacing
- Typography
- Layout
- Component consistency
- Interaction quality
- Information hierarchy

The final UI must have its own visual identity.

---

## 3. Visual Hierarchy

Every page should have a clear hierarchy.

Users should immediately understand:

1. What page they are on
2. What the main purpose of the page is
3. What action they should take
4. What information is important
5. What actions are secondary

Avoid giving equal visual importance to every element.

Primary actions should be visually stronger than secondary actions.

---

## 4. Typography

Use a clean modern font system.

Typography should have clear differences between:

- Page titles
- Section titles
- Subtitles
- Body text
- Labels
- Helper text
- Secondary information

Avoid using too many font sizes or font weights.

Keep typography consistent throughout the application.

---

## 5. Spacing

Use consistent spacing throughout the application.

Prefer a predictable spacing system rather than arbitrary margins and padding.

Pay particular attention to:

- Page margins
- Section spacing
- Card padding
- Form spacing
- Button spacing
- Table spacing
- Mobile spacing

The UI should feel spacious without wasting screen space.

---

## 6. Colors

Use the project's existing brand colors whenever available.

Use colors with purpose:

- Primary color → primary actions and important elements
- Neutral colors → backgrounds and content
- Success → successful operations
- Warning → warnings
- Error → errors and destructive actions
- Muted colors → secondary information

Avoid excessive colors.

Do not use gradients, glowing effects, or colorful backgrounds unless
they have a clear purpose and fit the product identity.

---

## 7. Components

Components should be:

- Consistent
- Reusable
- Predictable
- Accessible
- Responsive

Maintain consistent styling for:

- Buttons
- Inputs
- Selects
- Dropdowns
- Cards
- Modals
- Tables
- Tabs
- Navigation
- Badges
- Alerts
- Toasts

Do not create multiple visual variations of the same component without
a clear reason.

Reuse existing project components whenever possible.

---

## 8. Forms

Forms should be simple and easy to understand.

Every form should consider:

- Clear labels
- Helpful placeholders where necessary
- Validation
- Error messages
- Loading states
- Disabled states
- Focus states
- Success states
- Keyboard navigation

Error messages should clearly explain what went wrong and how to fix it.

---

## 9. Buttons

Buttons must clearly communicate their purpose.

Use:

- Primary button → main action
- Secondary button → supporting action
- Ghost button → low-priority action
- Destructive button → dangerous action

Buttons should have proper:

- Hover state
- Active state
- Focus state
- Disabled state
- Loading state

Avoid having too many prominent buttons on one screen.

---

## 10. Cards

Cards should be used when they help group related information.

Do not put everything inside cards.

Avoid excessive:

- Borders
- Shadows
- Rounded containers
- Nested cards

Use cards intentionally to create structure.

---

## 11. Responsive Design

Every UI must work properly on:

- Desktop
- Laptop
- Tablet
- Mobile

Do not simply shrink the desktop UI.

For mobile:

- Reorganize layouts when necessary
- Reduce unnecessary content
- Make buttons easy to tap
- Ensure forms fit the screen
- Prevent horizontal scrolling
- Make tables usable
- Maintain readable typography

---

## 12. Accessibility

Always consider accessibility.

Use:

- Proper semantic HTML
- Accessible labels
- Keyboard navigation
- Visible focus states
- Sufficient color contrast
- Appropriate button and input states
- Meaningful error messages

Do not rely only on color to communicate information.

---

## 13. Animation

Animations should be subtle and purposeful.

Good examples:

- Page transitions
- Modal entrance
- Dropdown transitions
- Button loading
- Hover interactions
- Small state changes

Avoid excessive animations.

The application should feel fast and responsive.

---

## 14. Empty, Loading and Error States

Every data-driven page should consider:

### Loading
Show an appropriate loading state instead of leaving the UI blank.

### Empty
Explain what the user can do next.

### Error
Clearly explain what happened and provide a useful recovery action.

Do not show empty screens without context.

---

## 15. Tables and Data

Tables should prioritize readability.

Use:

- Clear column hierarchy
- Appropriate spacing
- Consistent alignment
- Useful sorting/filtering where needed
- Responsive behavior
- Clear row actions

Do not overcrowd tables with unnecessary information.

---

## 16. Forms and CRUD Screens

For create/edit pages:

- Keep the primary action obvious
- Group related fields
- Use sections when the form is large
- Avoid overwhelming the user
- Show validation close to the relevant field
- Clearly distinguish required and optional fields

---

## 17. Mobile UX

Always check the UI from a mobile-first perspective.

Important actions should remain easy to access.

Avoid:

- Tiny buttons
- Tiny text
- Excessive horizontal layouts
- Desktop-only interactions
- Horizontal scrolling unless genuinely necessary

---

## 18. UI Quality Checklist

Before considering a UI complete, verify:

- [ ] Visual hierarchy is clear
- [ ] Spacing is consistent
- [ ] Typography is consistent
- [ ] Colors follow the design system
- [ ] Components are consistent
- [ ] Primary actions are obvious
- [ ] Loading states exist
- [ ] Empty states exist where needed
- [ ] Error states exist
- [ ] Mobile layout works
- [ ] No horizontal overflow
- [ ] Keyboard navigation works
- [ ] Focus states are visible
- [ ] No unnecessary animations
- [ ] No unnecessary dependencies
- [ ] No duplicated components
- [ ] No console errors
- [ ] UI looks production-ready

---

## 19. Implementation Rules

Before creating a new UI:

1. Inspect the existing project structure.
2. Check existing components.
3. Check the existing design system.
4. Reuse existing components whenever possible.
5. Follow the existing coding conventions.
6. Avoid unnecessary dependencies.
7. Avoid unnecessary files.
8. Keep components maintainable.
9. Ensure responsive behavior.
10. Test the final UI visually.

Do not redesign unrelated parts of the application unless explicitly requested.

---

## 20. Important Rule

When implementing any UI, do not stop at the first working version.

After implementation, review the result as a senior UI/UX designer and
improve:

- Spacing
- Alignment
- Typography
- Visual hierarchy
- Responsiveness
- Component consistency
- Interaction states
- Overall polish

The final result should look like a professionally designed production
application, not simply a functional implementation.
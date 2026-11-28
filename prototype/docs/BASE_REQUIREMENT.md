# Base requirement — UnieMax seller + admin prototype

Fill this in one section at a time. Each section becomes screens in
`js/screens/seller.js` or `js/screens/admin.js`.

Write every screen with the same four parts:
**Purpose** (one line) · **Content** (what is on it) · **Actions** (buttons and
what they do) · **States** (loading, empty, error, and any special case).

---

## 1. Product overview

- **What:**
- **Who:** sellers (shop owners, mostly on phones) and UnieMax staff (admin console, desktop)
- **Platform:** web — seller app is phone-first; admin console is desktop-first
- **Market:**
- **Main goal of this feature:**

## 2. Design system

Follow the real app's rules: [`docs/DESIGN_GUIDELINES.md`](../../docs/DESIGN_GUIDELINES.md)
(it is the single source; this prototype does not keep a copy).

- Colours, fonts, sizes: the real `frontend/src/index.css` (seller) and
  `frontend/src/admin/admin.css` (console) — the prototype loads both as they are.
- New colours or sizes for this feature (if any):

## 3. Users and roles

| Role | Signs in with | Can do |
| ---- | ------------- | ------ |
| Seller | Mobile OTP or email | |
| Admin | Email + password | |
| Super admin | Email + password | |

## 4. Auth and onboarding

### Screen: Seller sign in
- Purpose:
- Content:
- Actions:
- States:

### Screen: Admin sign in
- Purpose:
- Content:
- Actions:
- States:

## 5. Seller — <area name>

### Screen: <name>
- Purpose:
- Content:
- Actions:
- States:

## 6. Admin — <area name>

### Screen: <name>
- Purpose:
- Content:
- Actions:
- States:

<!-- Add one section per area (7, 8, …). -->

## Statuses and business rules

For each thing that has a status:

| Entity | Status order | Who changes it | What the other side sees |
| ------ | ------------ | -------------- | ------------------------ |
| | | | |

Rules (limits, fees, who may do what, what happens on failure):

-

## Navigation structure

- **Seller:** sidebar on desktop; phone tab bar (Home · Orders · Products · Design · More)
- **Admin:** sidebar groups (Overview · Commerce · Finance · Accounts · Platform · Documents)
- Where the new screens go:

## Prototype deliverables

The flows that must work end to end (each one: start in which app → steps → what
the other app shows):

1.
2.
3.

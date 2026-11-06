# UnieMax – WhatsApp Message Templates (full list)

All templates on the **Message templates** page of the **UnieMax** WhatsApp Business Account.
Checked in WhatsApp Manager on 6 Nov 2026.

| Item | Value |
|---|---|
| WhatsApp Business Account (WABA) | UnieMax – `946861481250667` |
| Sending phone number | +91 70943 10139 |
| Phone Number ID | `1297227253483920` |
| Meta Business ID | `998630909433831` |
| Total templates | 13 (12 **Active**, `seller_payout_sent_v2` in review) |

> Templates only work inside the WABA where they were created. Always send from the UnieMax account above.
> The other account "Zontechx" (`1762129785093231`) has no phone number and cannot send. Ignore any templates there.

---

## 1. Summary

| # | Template name | Category | Language code | Body params | Button | Sent to | Template ID |
|---|---|---|---|---|---|---|---|
| 1 | `order_received_to_seller` | Utility | `en` | 11 | – | Seller | 1131208519288123 |
| 2 | `order_confirmed_without_link` | Utility | `en` | 4 | – | Customer | 1128099336469641 |
| 3 | `order_shipped_without_link` | Utility | `en` | 6 | – | Customer | 1750778132656044 |
| 4 | `order_delivered` | Utility | `en` | 3 | – | Customer | 1159610466940932 |
| 5 | `seller_setup_pending` | Utility | `en` | 4 | URL (dynamic) | Seller | 28600423142985019 |
| 6 | `seller_setup_products` | Utility | `en` | 2 | URL (dynamic) | Seller | 941258585373085 |
| 7 | `seller_setup_address` | Utility | `en` | 2 | URL (dynamic) | Seller | 1128664503008220 |
| 8 | `seller_setup_tax` | Utility | `en` | 2 | URL (dynamic) | Seller | 1118453820592716 |
| 9 | `seller_setup_payout` | Utility | `en` | 2 | URL (dynamic) | Seller | 1134438049011372 |
| 10 | `seller_motivation_tip` | Marketing | `en` | 2 | URL (dynamic) | Seller | 1672165614609890 |
| 11 | `uniemax_address_update` | Utility | `en_US` | 3 | – | Customer | 1833517641150563 |
| 12 | `seller_payout_sent` | Utility | `en` | 10 | URL (dynamic) | Seller | – (approved 6 Nov 2026; ID not recorded yet) |
| 13 | `seller_payout_sent_v2` | Utility | `en` | 13 | URL (dynamic) | Seller | – (In review, submitted 6 Nov 2026 — replaces #12 automatically once approved) |

---

## 2. How to send (WhatsApp Cloud API)

```
POST https://graph.facebook.com/{API_VERSION}/1297227253483920/messages
Authorization: Bearer {ACCESS_TOKEN}
Content-Type: application/json
```

**Template without a button**

```json
{
  "messaging_product": "whatsapp",
  "to": "91XXXXXXXXXX",
  "type": "template",
  "template": {
    "name": "<template_name>",
    "language": { "code": "en" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "<{{1}}>" },
          { "type": "text", "text": "<{{2}}>" }
        ]
      }
    ]
  }
}
```

**Template with a dynamic URL button** (all `seller_setup_*`, `seller_motivation_tip` and `seller_payout_sent`)

The button URL in the template is `https://uniemax.com/mystores/{{1}}`.
You only send the part after `/mystores/` (the store slug + path). Example: `sabse-kart-home-food-delivery/products`.

```json
{
  "type": "button",
  "sub_type": "url",
  "index": "0",
  "parameters": [
    { "type": "text", "text": "sabse-kart-home-food-delivery/products" }
  ]
}
```

Add this object to `components` after the `body` object.

### Parameter rules

1. Send body params in order `{{1}}, {{2}}, ...`. The count must match exactly (error `132000` if not).
2. A param can't be empty. Send `"NA"` or `"-"` if data is missing.
3. A param can't contain new lines, tabs, or more than 4 spaces in a row (error `132018`).
4. `to`: country code + number, digits only. Example `919876543210`.
5. Amounts: number only. The `₹` sign is already in the text.
6. Button param: only the URL suffix. Do not send the full URL and do not start it with `/`.

---

## 3. Order templates

### 3.1 `order_received_to_seller`

- **Category:** Utility · **Language:** `en` · **Status:** Active
- **Send to:** Seller · **When:** A customer places a new order
- **Header / Footer / Buttons:** none

```
Hi {{1}},

You have received a new order #{{2}} in your store {{3}}.

Order details:
• Customer name: {{4}}
• Delivery address: {{5}}
• Pincode: {{6}}
• Product: {{7}}
• Product price: ₹{{8}}
• Payment type: {{9}}
• Product link: {{10}}
• Order link: {{11}}

Please review and confirm this order from your seller dashboard.
Thank you.
```

| Var | Field | Example |
|---|---|---|
| {{1}} | Seller name | Ravi |
| {{2}} | Order ID (no `#`) | ORD12345 |
| {{3}} | Store name | Fashion Hub |
| {{4}} | Customer name | Rahul Sharma |
| {{5}} | Delivery address (one line) | 12 MG Road, Kochi, Kerala |
| {{6}} | Pincode | 682016 |
| {{7}} | Product(s), comma separated | Blue Cotton Kurta (Size M) x 1 |
| {{8}} | Product price (number only) | 1499 |
| {{9}} | Payment type | Cash on Delivery |
| {{10}} | Product link | https://uniemax.com/fashionhub/product/blue-cotton-kurta |
| {{11}} | Order link | https://uniemax.com/seller/orders/ORD12345 |

### 3.2 `order_confirmed_without_link`

- **Category:** Utility · **Language:** `en` · **Status:** Active
- **Send to:** Customer · **When:** Order is confirmed
- **Header / Footer / Buttons:** none

```
Hi {{1}},
Your order #{{2}} has been confirmed successfully!
Order Amount: ₹{{3}}
We are now preparing your order for shipment.
Thank you for shopping with {{4}}! 😊
```

| Var | Field | Example |
|---|---|---|
| {{1}} | Customer name | Rahul |
| {{2}} | Order ID (no `#`) | ORD12345 |
| {{3}} | Order amount (number only) | 1499 |
| {{4}} | Store name | Fashion Hub |

### 3.3 `order_shipped_without_link`

- **Category:** Utility · **Language:** `en` · **Status:** Active
- **Send to:** Customer · **When:** Order is handed to the courier
- **Header / Footer / Buttons:** none

```
Hi {{1}},
Good news! Your order #{{2}} has been shipped. 🚚
Courier: {{3}}
Tracking ID: {{4}}
Track your shipment here:
{{5}}
Thank you for shopping with {{6}}! 😊
```

| Var | Field | Example |
|---|---|---|
| {{1}} | Customer name | Rahul |
| {{2}} | Order ID (no `#`) | ORD12345 |
| {{3}} | Courier name | Delhivery |
| {{4}} | Tracking number | DL987654321IN |
| {{5}} | Tracking URL | https://www.delhivery.com/track/package/DL987654321IN |
| {{6}} | Store name | Fashion Hub |

### 3.4 `order_delivered`

- **Category:** Utility · **Language:** `en` · **Status:** Active
- **Send to:** Customer · **When:** Order is delivered
- **Header / Footer / Buttons:** none

```
Hi {{1}},
Your order #{{2}} has been successfully delivered! 🎉
We hope you enjoy your purchase.
Thank you for shopping with {{3}}.
We look forward to serving you again!
```

| Var | Field | Example |
|---|---|---|
| {{1}} | Customer name | Rahul |
| {{2}} | Order ID (no `#`) | ORD12345 |
| {{3}} | Store name | Fashion Hub |

---

## 4. Seller setup templates

All have a **Visit website** button with URL `https://uniemax.com/mystores/{{1}}`. Send the URL suffix as the button parameter (see section 2).

### 4.1 `seller_setup_pending`

- **Category:** Utility · **Language:** `en` · **Status:** Active
- **Send to:** Seller · **When:** Store setup is not complete (general reminder)
- **Header / Footer:** none
- **Button:** "Continue setup" → `https://uniemax.com/mystores/{{1}}`

```
Hi {{1}}, the setup for {{2}} is {{3}} complete. Still to do: {{4}}. Finishing these unlocks selling and payouts. Tap below to continue.
```

| Var | Field | Example |
|---|---|---|
| {{1}} | Seller name | Rahul |
| {{2}} | Store name | Sabse Kart |
| {{3}} | Percent complete (include `%`) | 58% |
| {{4}} | Pending steps, comma separated | Products, Address, Tax details, Payout bank account |
| Button {{1}} | Store slug | sabse-kart-home-food-delivery |

### 4.2 `seller_setup_products`

- **Category:** Utility · **Language:** `en` · **Status:** Active
- **Send to:** Seller · **When:** Store has no live product
- **Header:** none · **Footer:** `UnieMax`
- **Button:** "Add products" → `https://uniemax.com/mystores/{{1}}`

```
Hi {{1}}, your store {{2}} is almost ready. Add at least one live product so customers can start buying. Tap below to add it.
UnieMax
```

| Var | Field | Example |
|---|---|---|
| {{1}} | Seller name | Rahul |
| {{2}} | Store name | Sabse Kart |
| Button {{1}} | Store slug + `/products` | sabse-kart-home-food-delivery/products |

### 4.3 `seller_setup_address`

- **Category:** Utility · **Language:** `en` · **Status:** Active
- **Send to:** Seller · **When:** Business address is missing
- **Header / Footer:** none
- **Button:** "Add address" → `https://uniemax.com/mystores/{{1}}`

```
Hi {{1}}, please add your business address for {{2}}. Customers and our team use it to confirm your store location. Tap below to update it.
```

| Var | Field | Example |
|---|---|---|
| {{1}} | Seller name | Rahul |
| {{2}} | Store name | Sabse Kart |
| Button {{1}} | Store slug + `/business` | sabse-kart-home-food-delivery/business |

### 4.4 `seller_setup_tax`

- **Category:** Utility · **Language:** `en` · **Status:** Active
- **Send to:** Seller · **When:** PAN / GST details are missing
- **Header / Footer:** none
- **Button:** "Add tax details" → `https://uniemax.com/mystores/{{1}}`

```
Hi {{1}}, please add the tax details for {{2}}: your PAN and GST registration status. This is required before your store can take payments. Tap below to add them.
```

| Var | Field | Example |
|---|---|---|
| {{1}} | Seller name | Rahul |
| {{2}} | Store name | Sabse Kart |
| Button {{1}} | Store slug + `/business` | sabse-kart-home-food-delivery/business |

### 4.5 `seller_setup_payout`

- **Category:** Utility · **Language:** `en` · **Status:** Active
- **Send to:** Seller · **When:** No primary bank account for payouts
- **Header / Footer:** none
- **Button:** "Add bank account" → `https://uniemax.com/mystores/{{1}}`

```
Hi {{1}}, add a primary bank account for {{2}} so we can send your payouts. Tap below to add it.
```

| Var | Field | Example |
|---|---|---|
| {{1}} | Seller name | Rahul |
| {{2}} | Store name | Sabse Kart |
| Button {{1}} | Store slug + `/bank-accounts` | sabse-kart-home-food-delivery/bank-accounts |

### 4.6 `seller_motivation_tip`

- **Category:** Marketing · **Language:** `en` · **Status:** Active
- **Send to:** Seller · **When:** Occasional tip (only to sellers who opted in to marketing messages)
- **Header / Footer:** none
- **Button:** "Open my store" → `https://uniemax.com/mystores/{{1}}`
- **Note:** This template was created for the **Marketing Messages Lite API (MM Lite)**. Marketing messages cost more than Utility and may not be delivered to users who opted out of marketing.

```
Hi {{1}}, a quick tip for {{2}}: clear photos and accurate prices help customers decide faster. Keep your listings fresh and keep going!
```

| Var | Field | Example |
|---|---|---|
| {{1}} | Seller name | Rahul |
| {{2}} | Store name | Sabse Kart |
| Button {{1}} | Store slug | sabse-kart-home-food-delivery |

---

## 5. Payout templates

### 5.1 `seller_payout_sent`

- **Category:** Utility · **Language:** `en` · **Status:** Active (approved 6 Nov 2026)
- **Send to:** Seller (store business phone, else owner phone) · **When:** A payout is marked **Paid out** — automatically (manual payout recorded as Sent / changed to Paid out, or PaymentHub success), or by hand from the order page (**Send message**)
- **Header:** none · **Footer:** `UnieMax seller payouts`
- **Button:** "View earnings" → `https://uniemax.com/mystores/{{1}}`
- **Code:** `backend/src/modules/payouts/payouts.notifications.ts`

```
Hi {{1}},

UnieMax has sent you a payout of ₹{{2}} for order #{{3}} from your store {{4}}.

Payout details:
• Order total: ₹{{5}}
• Platform fee: ₹{{6}}
• COD dues adjusted: ₹{{7}}
• Paid to: {{8}}
• Reference (UTR): {{9}}
• Paid on: {{10}}

It may take a few hours to show in your bank account. Tap below to see all your earnings.
UnieMax seller payouts
```

| Var | Field | Example |
|---|---|---|
| {{1}} | Seller name | Ravi |
| {{2}} | Amount sent (number only) | 1,349.10 |
| {{3}} | Order number (no `#`) | UM-1002 |
| {{4}} | Store name | Fashion Hub |
| {{5}} | Order total (number only) | 1,499.00 |
| {{6}} | Platform fee (number only) | 149.90 |
| {{7}} | COD dues adjusted (number only) | 0.00 |
| {{8}} | Bank + last 4 digits | State Bank of India A/c XX4821 |
| {{9}} | UTR / reference (`NA` if none) | HDFCR52026110512345 |
| {{10}} | Date (and time) paid | 5 Nov 2026, 2:30 pm |
| Button {{1}} | Store slug + `/earnings` | fashion-hub/earnings |

> Only send the masked account number (last 4 digits). Never send the full bank account number.

### 5.2 `seller_payout_sent_v2` (with the payment gateway fee)

- **Category:** Utility · **Language:** `en` · **Status:** In review (submitted 6 Nov 2026)
- **Same use as 5.1**, plus the payment gateway fee line — shown to the seller as **UnieMax's discount** while UnieMax pays it.
- **The code sends v2 automatically once Meta approves it**; until then it keeps sending 5.1. No code change needed when it is approved.
- **Header:** none · **Footer:** `UnieMax seller payouts`
- **Button:** "View earnings" → `https://uniemax.com/mystores/{{1}}`

```
Hi {{1}},

UnieMax has sent you a payout of ₹{{2}} for order #{{3}} from your store {{4}}.

Payout details:
• Order total: ₹{{5}}
• Platform fee: ₹{{6}}
• Payment gateway fee ({{7}}): ₹{{8}}, {{9}}
• COD dues adjusted: ₹{{10}}
• Paid to: {{11}}
• Reference (UTR): {{12}}
• Paid on: {{13}}

It may take a few hours to show in your bank account. Tap below to see all your earnings.
UnieMax seller payouts
```

| Var | Field | Example |
|---|---|---|
| {{1}} | Seller name | Ravi |
| {{2}} | Amount sent (number only) | 1,349.10 |
| {{3}} | Order number (no `#`) | UM-1002 |
| {{4}} | Store name | Fashion Hub |
| {{5}} | Order total (number only) | 1,499.00 |
| {{6}} | Platform fee (number only) | 149.90 |
| {{7}} | Gateway fee percent (include `%`) | 2% |
| {{8}} | Gateway fee amount (number only) | 29.98 |
| {{9}} | Who pays it | paid by UnieMax as your discount |
| {{10}} | COD dues adjusted (number only) | 0.00 |
| {{11}} | Bank + last 4 digits | State Bank of India A/c XX4821 |
| {{12}} | UTR / reference (`NA` if none) | HDFCR52026110512345 |
| {{13}} | Date (and time) paid | 5 Nov 2026, 2:30 pm |
| Button {{1}} | Store slug + `/earnings` | fashion-hub/earnings |

`{{9}}` is `paid by UnieMax as your discount` while UnieMax pays the gateway fee
(Finance → Fee settings), or `deducted from this payout` if that is ever switched to the seller.

---

## 6. Other templates

### 6.1 `uniemax_address_update`

- **Category:** Utility · **Language:** `en_US` (note: not `en`) · **Status:** Active
- **Send to:** Customer · **When:** Customer's delivery address is changed
- **Header (text):** `Address update` · **Footer / Buttons:** none

```
Address update

Hi {{1}}, your delivery address has been successfully updated to {{2}}. Contact {{3}} for any inquiries.
```

| Var | Field | Example |
|---|---|---|
| {{1}} | Customer name | John |
| {{2}} | New address (one line) | 123 Main St |
| {{3}} | Support contact (email / phone) | support@uniemax.com |

---

## 7. Full example – template with button

```json
{
  "messaging_product": "whatsapp",
  "to": "919876543210",
  "type": "template",
  "template": {
    "name": "seller_setup_pending",
    "language": { "code": "en" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Rahul" },
          { "type": "text", "text": "Sabse Kart" },
          { "type": "text", "text": "58%" },
          { "type": "text", "text": "Products, Address, Tax details, Payout bank account" }
        ]
      },
      {
        "type": "button",
        "sub_type": "url",
        "index": "0",
        "parameters": [
          { "type": "text", "text": "sabse-kart-home-food-delivery" }
        ]
      }
    ]
  }
}
```

---

## 8. Template config (copy into code)

`body` = body params in order. `button` = what the URL button param should contain (null = no button).

```json
{
  "order_received_to_seller": {
    "language": "en", "category": "UTILITY", "recipient": "seller",
    "body": ["sellerName", "orderId", "storeName", "customerName", "deliveryAddress", "pincode", "product", "productPrice", "paymentType", "productLink", "orderLink"],
    "button": null
  },
  "order_confirmed_without_link": {
    "language": "en", "category": "UTILITY", "recipient": "customer",
    "body": ["customerName", "orderId", "orderAmount", "storeName"],
    "button": null
  },
  "order_shipped_without_link": {
    "language": "en", "category": "UTILITY", "recipient": "customer",
    "body": ["customerName", "orderId", "courierName", "trackingNumber", "trackingUrl", "storeName"],
    "button": null
  },
  "order_delivered": {
    "language": "en", "category": "UTILITY", "recipient": "customer",
    "body": ["customerName", "orderId", "storeName"],
    "button": null
  },
  "seller_setup_pending": {
    "language": "en", "category": "UTILITY", "recipient": "seller",
    "body": ["sellerName", "storeName", "percentComplete", "pendingSteps"],
    "button": "{storeSlug}"
  },
  "seller_setup_products": {
    "language": "en", "category": "UTILITY", "recipient": "seller",
    "body": ["sellerName", "storeName"],
    "button": "{storeSlug}/products"
  },
  "seller_setup_address": {
    "language": "en", "category": "UTILITY", "recipient": "seller",
    "body": ["sellerName", "storeName"],
    "button": "{storeSlug}/business"
  },
  "seller_setup_tax": {
    "language": "en", "category": "UTILITY", "recipient": "seller",
    "body": ["sellerName", "storeName"],
    "button": "{storeSlug}/business"
  },
  "seller_setup_payout": {
    "language": "en", "category": "UTILITY", "recipient": "seller",
    "body": ["sellerName", "storeName"],
    "button": "{storeSlug}/bank-accounts"
  },
  "seller_motivation_tip": {
    "language": "en", "category": "MARKETING", "recipient": "seller",
    "body": ["sellerName", "storeName"],
    "button": "{storeSlug}"
  },
  "uniemax_address_update": {
    "language": "en_US", "category": "UTILITY", "recipient": "customer",
    "body": ["customerName", "newAddress", "supportContact"],
    "button": null
  },
  "seller_payout_sent": {
    "language": "en", "category": "UTILITY", "recipient": "seller",
    "body": ["sellerName", "amountSent", "orderId", "storeName", "orderTotal", "platformFee", "codDues", "paidTo", "utr", "paidOn"],
    "button": "{storeSlug}/earnings"
  },
  "seller_payout_sent_v2": {
    "language": "en", "category": "UTILITY", "recipient": "seller",
    "body": ["sellerName", "amountSent", "orderId", "storeName", "orderTotal", "platformFee", "gatewayPercent", "gatewayFee", "gatewayNote", "codDues", "paidTo", "utr", "paidOn"],
    "button": "{storeSlug}/earnings"
  }
}
```

## 9. Common errors

| Code | Meaning |
|---|---|
| `132000` | Wrong number of parameters |
| `132001` | Template name / language not found in this WABA (or not approved) |
| `132018` | Bad characters in a parameter (new line, tab, many spaces) |
| `131026` | Recipient number is not on WhatsApp |
| `190` | Access token expired or invalid |

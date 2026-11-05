/**
 * Reference data for Documents → WhatsApp templates.
 *
 * A hand-kept copy of `whatsapp_templates.md` (checked in WhatsApp Manager on
 * 3 Nov 2026). It is documentation, not config: the backend sends with its own
 * names and value order (`whatsapp.orderMessages.ts` and friends), and the live
 * list with approval status is WhatsApp → Templates. When a template changes in
 * WhatsApp Manager, update the md file and this file together.
 */

export type TemplateGroup = 'Order' | 'Seller setup' | 'Payout' | 'Other'

export interface TemplateParam {
  /** `{{1}}`, `{{2}}`… — the position Meta expects. */
  slot: number
  /** Name used in code / the config block of the md file. */
  key: string
  field: string
  example: string
}

export interface TemplateButton {
  label: string
  /** The fixed part of the URL; the value is appended after it. */
  urlPrefix: string
  field: string
  example: string
}

export interface TemplateDoc {
  name: string
  group: TemplateGroup
  category: 'Utility' | 'Marketing'
  language: string
  recipient: 'Seller' | 'Customer'
  when: string
  templateId: string
  header?: string
  body: string
  footer?: string
  params: TemplateParam[]
  button?: TemplateButton
  note?: string
}

export const WA_ACCOUNT = [
  { label: 'Business account (WABA)', value: 'UnieMax – 946861481250667' },
  { label: 'Sending number', value: '+91 70943 10139' },
  { label: 'Phone number ID', value: '1297227253483920' },
  { label: 'Meta Business ID', value: '998630909433831' },
]

export const WA_SEND_RULES = [
  'Send body values in order {{1}}, {{2}}… — the count must match exactly (error 132000).',
  'A value cannot be empty. Send "NA" or "-" when the data is missing.',
  'No new lines, tabs or more than 4 spaces in a row inside a value (error 132018).',
  'Phone number: country code + number, digits only — e.g. 919876543210.',
  'Amounts: number only. The ₹ sign is already in the template text.',
  'Button value: only the part after /mystores/. Never the full URL, never a leading /.',
]

export const WA_ERRORS = [
  { code: '132000', meaning: 'Wrong number of parameters' },
  { code: '132001', meaning: 'Template name / language not found in this account (or not approved)' },
  { code: '132018', meaning: 'Bad characters in a parameter (new line, tab, many spaces)' },
  { code: '131026', meaning: 'Recipient number is not on WhatsApp' },
  { code: '190', meaning: 'Access token expired or invalid' },
]

const p = (slot: number, key: string, field: string, example: string): TemplateParam => ({
  slot,
  key,
  field,
  example,
})

const MYSTORES = 'https://uniemax.com/mystores/'

const SELLER_STORE = [
  p(1, 'sellerName', 'Seller name', 'Rahul'),
  p(2, 'storeName', 'Store name', 'Sabse Kart'),
]

export const WA_TEMPLATE_DOCS: TemplateDoc[] = [
  {
    name: 'order_received_to_seller',
    group: 'Order',
    category: 'Utility',
    language: 'en',
    recipient: 'Seller',
    when: 'A customer places a new order',
    templateId: '1131208519288123',
    body: `Hi {{1}},

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
Thank you.`,
    params: [
      p(1, 'sellerName', 'Seller name', 'Ravi'),
      p(2, 'orderId', 'Order ID (no #)', 'ORD12345'),
      p(3, 'storeName', 'Store name', 'Fashion Hub'),
      p(4, 'customerName', 'Customer name', 'Rahul Sharma'),
      p(5, 'deliveryAddress', 'Delivery address (one line)', '12 MG Road, Kochi, Kerala'),
      p(6, 'pincode', 'Pincode', '682016'),
      p(7, 'product', 'Product(s), comma separated', 'Blue Cotton Kurta (Size M) x 1'),
      p(8, 'productPrice', 'Product price (number only)', '1499'),
      p(9, 'paymentType', 'Payment type', 'Cash on Delivery'),
      p(10, 'productLink', 'Product link', 'https://uniemax.com/fashionhub/product/blue-cotton-kurta'),
      p(11, 'orderLink', 'Order link', 'https://uniemax.com/seller/orders/ORD12345'),
    ],
  },
  {
    name: 'order_confirmed_without_link',
    group: 'Order',
    category: 'Utility',
    language: 'en',
    recipient: 'Customer',
    when: 'The order is confirmed',
    templateId: '1128099336469641',
    body: `Hi {{1}},
Your order #{{2}} has been confirmed successfully!
Order Amount: ₹{{3}}
We are now preparing your order for shipment.
Thank you for shopping with {{4}}! 😊`,
    params: [
      p(1, 'customerName', 'Customer name', 'Rahul'),
      p(2, 'orderId', 'Order ID (no #)', 'ORD12345'),
      p(3, 'orderAmount', 'Order amount (number only)', '1499'),
      p(4, 'storeName', 'Store name', 'Fashion Hub'),
    ],
  },
  {
    name: 'order_shipped_without_link',
    group: 'Order',
    category: 'Utility',
    language: 'en',
    recipient: 'Customer',
    when: 'The order is handed to the courier',
    templateId: '1750778132656044',
    body: `Hi {{1}},
Good news! Your order #{{2}} has been shipped. 🚚
Courier: {{3}}
Tracking ID: {{4}}
Track your shipment here:
{{5}}
Thank you for shopping with {{6}}! 😊`,
    params: [
      p(1, 'customerName', 'Customer name', 'Rahul'),
      p(2, 'orderId', 'Order ID (no #)', 'ORD12345'),
      p(3, 'courierName', 'Courier name', 'Delhivery'),
      p(4, 'trackingNumber', 'Tracking number', 'DL987654321IN'),
      p(5, 'trackingUrl', 'Tracking URL', 'https://www.delhivery.com/track/package/DL987654321IN'),
      p(6, 'storeName', 'Store name', 'Fashion Hub'),
    ],
  },
  {
    name: 'order_delivered',
    group: 'Order',
    category: 'Utility',
    language: 'en',
    recipient: 'Customer',
    when: 'The order is delivered',
    templateId: '1159610466940932',
    body: `Hi {{1}},
Your order #{{2}} has been successfully delivered! 🎉
We hope you enjoy your purchase.
Thank you for shopping with {{3}}.
We look forward to serving you again!`,
    params: [
      p(1, 'customerName', 'Customer name', 'Rahul'),
      p(2, 'orderId', 'Order ID (no #)', 'ORD12345'),
      p(3, 'storeName', 'Store name', 'Fashion Hub'),
    ],
  },
  {
    name: 'seller_setup_pending',
    group: 'Seller setup',
    category: 'Utility',
    language: 'en',
    recipient: 'Seller',
    when: 'Store setup is not complete (general reminder)',
    templateId: '28600423142985019',
    body: 'Hi {{1}}, the setup for {{2}} is {{3}} complete. Still to do: {{4}}. Finishing these unlocks selling and payouts. Tap below to continue.',
    params: [
      ...SELLER_STORE,
      p(3, 'percentComplete', 'Percent complete (include %)', '58%'),
      p(4, 'pendingSteps', 'Pending steps, comma separated', 'Products, Address, Tax details, Payout bank account'),
    ],
    button: {
      label: 'Continue setup',
      urlPrefix: MYSTORES,
      field: 'Store slug',
      example: 'sabse-kart-home-food-delivery',
    },
  },
  {
    name: 'seller_setup_products',
    group: 'Seller setup',
    category: 'Utility',
    language: 'en',
    recipient: 'Seller',
    when: 'The store has no live product',
    templateId: '941258585373085',
    body: 'Hi {{1}}, your store {{2}} is almost ready. Add at least one live product so customers can start buying. Tap below to add it.',
    footer: 'UnieMax',
    params: SELLER_STORE,
    button: {
      label: 'Add products',
      urlPrefix: MYSTORES,
      field: 'Store slug + /products',
      example: 'sabse-kart-home-food-delivery/products',
    },
  },
  {
    name: 'seller_setup_address',
    group: 'Seller setup',
    category: 'Utility',
    language: 'en',
    recipient: 'Seller',
    when: 'The business address is missing',
    templateId: '1128664503008220',
    body: 'Hi {{1}}, please add your business address for {{2}}. Customers and our team use it to confirm your store location. Tap below to update it.',
    params: SELLER_STORE,
    button: {
      label: 'Add address',
      urlPrefix: MYSTORES,
      field: 'Store slug + /business',
      example: 'sabse-kart-home-food-delivery/business',
    },
  },
  {
    name: 'seller_setup_tax',
    group: 'Seller setup',
    category: 'Utility',
    language: 'en',
    recipient: 'Seller',
    when: 'PAN / GST details are missing',
    templateId: '1118453820592716',
    body: 'Hi {{1}}, please add the tax details for {{2}}: your PAN and GST registration status. This is required before your store can take payments. Tap below to add them.',
    params: SELLER_STORE,
    button: {
      label: 'Add tax details',
      urlPrefix: MYSTORES,
      field: 'Store slug + /business',
      example: 'sabse-kart-home-food-delivery/business',
    },
  },
  {
    name: 'seller_setup_payout',
    group: 'Seller setup',
    category: 'Utility',
    language: 'en',
    recipient: 'Seller',
    when: 'No primary bank account for payouts',
    templateId: '1134438049011372',
    body: 'Hi {{1}}, add a primary bank account for {{2}} so we can send your payouts. Tap below to add it.',
    params: SELLER_STORE,
    button: {
      label: 'Add bank account',
      urlPrefix: MYSTORES,
      field: 'Store slug + /bank-accounts',
      example: 'sabse-kart-home-food-delivery/bank-accounts',
    },
  },
  {
    name: 'seller_motivation_tip',
    group: 'Seller setup',
    category: 'Marketing',
    language: 'en',
    recipient: 'Seller',
    when: 'Occasional tip — only to sellers who opted in to marketing messages',
    templateId: '1672165614609890',
    body: 'Hi {{1}}, a quick tip for {{2}}: clear photos and accurate prices help customers decide faster. Keep your listings fresh and keep going!',
    params: SELLER_STORE,
    button: {
      label: 'Open my store',
      urlPrefix: MYSTORES,
      field: 'Store slug',
      example: 'sabse-kart-home-food-delivery',
    },
    note: 'Made for the Marketing Messages Lite API (MM Lite). Marketing messages cost more than Utility and may not reach users who opted out of marketing.',
  },
  {
    name: 'seller_payout_sent',
    group: 'Payout',
    category: 'Utility',
    language: 'en',
    recipient: 'Seller',
    when: 'A payout to the seller is marked Paid out (manual or PaymentHub)',
    templateId: 'Not created yet — add it in WhatsApp Manager',
    body: `Hi {{1}},

UnieMax has sent you a payout of ₹{{2}} for order #{{3}} from your store {{4}}.

Payout details:
• Order total: ₹{{5}}
• Platform fee: ₹{{6}}
• COD dues adjusted: ₹{{7}}
• Paid to: {{8}}
• Reference (UTR): {{9}}
• Paid on: {{10}}

It may take a few hours to show in your bank account. Tap below to see all your earnings.`,
    footer: 'UnieMax seller payouts',
    params: [
      p(1, 'sellerName', 'Seller name', 'Ravi'),
      p(2, 'amountSent', 'Amount sent (number only)', '1,349.10'),
      p(3, 'orderId', 'Order number (no #)', 'UM-1002'),
      p(4, 'storeName', 'Store name', 'Fashion Hub'),
      p(5, 'orderTotal', 'Order total (number only)', '1,499.00'),
      p(6, 'platformFee', 'Platform fee (number only)', '149.90'),
      p(7, 'codDues', 'COD dues adjusted (number only)', '0.00'),
      p(8, 'paidTo', 'Bank + last 4 digits', 'State Bank of India A/c XX4821'),
      p(9, 'utr', 'UTR / reference ("NA" if none)', 'HDFCR52026110512345'),
      p(10, 'paidOn', 'Date (and time) paid', '5 Nov 2026, 2:30 pm'),
    ],
    button: {
      label: 'View earnings',
      urlPrefix: MYSTORES,
      field: 'Store slug + /earnings',
      example: 'fashion-hub/earnings',
    },
    note: 'Sent by modules/payouts/payouts.notifications.ts, once per payout, alongside an email. Until the template is approved, the send is refused and logged — the email still goes.',
  },
  {
    name: 'uniemax_address_update',
    group: 'Other',
    category: 'Utility',
    language: 'en_US',
    recipient: 'Customer',
    when: "The customer's delivery address is changed",
    templateId: '1833517641150563',
    header: 'Address update',
    body: 'Hi {{1}}, your delivery address has been successfully updated to {{2}}. Contact {{3}} for any inquiries.',
    params: [
      p(1, 'customerName', 'Customer name', 'John'),
      p(2, 'newAddress', 'New address (one line)', '123 Main St'),
      p(3, 'supportContact', 'Support contact (email / phone)', 'support@uniemax.com'),
    ],
    note: 'Language is en_US, not en — sending with "en" fails with error 132001.',
  },
]

export const TEMPLATE_GROUPS: TemplateGroup[] = ['Order', 'Seller setup', 'Payout', 'Other']

/** The Cloud API request body for this template, filled with the examples. */
export function sampleRequest(doc: TemplateDoc): string {
  const components: unknown[] = [
    {
      type: 'body',
      parameters: doc.params.map((param) => ({ type: 'text', text: param.example })),
    },
  ]
  if (doc.button) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: doc.button.example }],
    })
  }
  return JSON.stringify(
    {
      messaging_product: 'whatsapp',
      to: '919876543210',
      type: 'template',
      template: { name: doc.name, language: { code: doc.language }, components },
    },
    null,
    2,
  )
}

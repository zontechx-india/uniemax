// Mock data — the whole shared "world" both apps read.
//
//   demoState()     a busy live shop: orders in every stage, tickets, payouts
//   freshState()    (store.js) the same world with no orders, tickets or payouts
//
// Times are minutes before "now", so the demo always looks recent. Our seller is
// Priya Raman, owner of Lakshmi Silk Sarees (state.me.storeId). The other stores
// exist so the admin console has a real-looking list.
//
// Login for the prototype: seller OTP 123456 (any 10-digit number), or any
// email + password; admin anita@uniemax.com + any password.

const DEMO_LOGIN = { otp: '123456', sellerPhone: '98450 12345', sellerEmail: 'priya@lakshmisilks.in', adminEmail: 'anita@uniemax.com' }

function buildWorld(kind) {
  const now = Date.now()
  const ago = (minutes) => new Date(now - minutes * 60000).toISOString()
  const H = 60
  const D = 24 * H

  const owners = {
    u_priya: { id: 'u_priya', name: 'Priya Raman', email: 'priya@lakshmisilks.in', phone: '+91 98450 12345' },
    u_arun: { id: 'u_arun', name: 'Arun Kumar', email: 'arun@kovaihandlooms.in', phone: '+91 94430 55120' },
    u_fathima: { id: 'u_fathima', name: 'Fathima Nasser', email: 'fathima@malabarspice.in', phone: '+91 97440 21877' },
    u_karthik: { id: 'u_karthik', name: 'Karthik S', email: 'karthik.crafts@gmail.com', phone: '+91 90030 77412' },
    u_meera: { id: 'u_meera', name: 'Meera Nair', email: 'meera@urbankurti.in', phone: '+91 99620 18834' },
    u_vignesh: { id: 'u_vignesh', name: 'Vignesh Raja', email: 'vignesh@tanjoreart.in', phone: '+91 93810 44290' },
    u_divya: { id: 'u_divya', name: 'Divya Menon', email: 'divya@greenleaf.in', phone: '+91 95000 63318' },
    u_sundar: { id: 'u_sundar', name: null, email: 'sundar.brass@gmail.com', phone: null },
  }

  const store = (s) => ({
    isPublished: true,
    suspendedAt: null,
    suspendedReason: null,
    verifiedAt: null,
    verifyNote: null,
    setupPending: [],
    settings: { online: true, cod: true, shipping: 'DELIVERY', rate: { type: 'FLAT', amount: 60, freeAbove: 1499 } },
    stats: null,
    ...s,
  })

  const stores = [
    store({
      id: 'st_lakshmi',
      name: 'Lakshmi Silk Sarees',
      slug: 'lakshmi-silk-sarees',
      ownerId: 'u_priya',
      tone: '#6c3ef4',
      createdAt: ago(62 * D),
      publishedAt: ago(58 * D),
      business: {
        businessName: 'Lakshmi Silks',
        sellerName: 'Priya Raman',
        gstin: '33ABCPR1234F1Z5',
        pan: 'ABCPR1234F',
        address: '14, Gandhi Road, Kanchipuram, Tamil Nadu 631501',
        submittedAt: ago(20 * D),
      },
      bank: { holder: 'PRIYA RAMAN', number: '50100123456789', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', branch: 'Kanchipuram', status: 'VERIFIED' },
    }),
    store({
      id: 'st_kovai', name: 'Kovai Handlooms', slug: 'kovai-handlooms', ownerId: 'u_arun', tone: '#1863dc',
      createdAt: ago(120 * D), publishedAt: ago(115 * D), verifiedAt: ago(90 * D),
      stats: { products: 48, categories: 6, orders: 214, revenue: 412880 },
    }),
    store({
      id: 'st_malabar', name: 'Malabar Spice Co.', slug: 'malabar-spice', ownerId: 'u_fathima', tone: '#c2410c',
      createdAt: ago(95 * D), publishedAt: ago(93 * D), verifiedAt: ago(60 * D),
      stats: { products: 31, categories: 4, orders: 389, revenue: 268410 },
    }),
    store({
      id: 'st_chennai', name: 'Chennai Craft House', slug: 'chennai-craft-house', ownerId: 'u_karthik', tone: '#008000',
      createdAt: ago(40 * D), publishedAt: ago(33 * D),
      setupPending: ['Business details', 'Bank account'],
      stats: { products: 22, categories: 3, orders: 41, revenue: 52300 },
    }),
    store({
      id: 'st_urban', name: 'Urban Kurti Studio', slug: 'urban-kurti-studio', ownerId: 'u_meera', tone: '#d62976',
      createdAt: ago(30 * D), publishedAt: ago(28 * D),
      setupPending: ['Bank account'],
      stats: { products: 64, categories: 5, orders: 97, revenue: 118640 },
    }),
    store({
      id: 'st_tanjore', name: 'Thanjavur Art Gallery', slug: 'thanjavur-art', ownerId: 'u_vignesh', tone: '#856404',
      createdAt: ago(75 * D), publishedAt: ago(70 * D), suspendedAt: ago(4 * D),
      suspendedReason: 'Several customers reported orders not delivered after 3 weeks.',
      stats: { products: 18, categories: 2, orders: 63, revenue: 201500 },
    }),
    store({
      id: 'st_green', name: 'Green Leaf Organics', slug: 'green-leaf-organics', ownerId: 'u_divya', tone: '#1da851',
      createdAt: ago(9 * D), publishedAt: null, isPublished: false,
      setupPending: ['Products', 'Business details', 'Bank account'],
      stats: { products: 0, categories: 1, orders: 0, revenue: 0 },
    }),
    store({
      id: 'st_brass', name: 'Madurai Brass Works', slug: 'madurai-brass', ownerId: 'u_sundar', tone: '#707070',
      createdAt: ago(3 * D), publishedAt: null, isPublished: false,
      setupPending: ['Shop name & logo', 'Products'],
      stats: { products: 0, categories: 0, orders: 0, revenue: 0 },
    }),
  ]

  const products = [
    ['p1', 'Kanchipuram Pure Silk Saree — Temple Border', 'Silk sarees', 12499, 14999, 6, '#7a1f3d'],
    ['p2', 'Soft Silk Saree — Peacock Blue', 'Silk sarees', 4299, 4999, 14, '#1d4e89'],
    ['p3', 'Banarasi Art Silk Saree — Gold Zari', 'Silk sarees', 3599, 4200, 3, '#b8860b'],
    ['p4', 'Chettinad Cotton Saree — Mustard Checks', 'Cotton sarees', 1499, 1799, 22, '#c99700'],
    ['p5', 'Kerala Kasavu Set Mundu', 'Cotton sarees', 1899, 2199, 0, '#d9c58b'],
    ['p6', 'Silk Cotton Saree — Rani Pink', 'Silk cotton', 2499, 2999, 9, '#c2185b'],
    ['p7', 'Ready-made Silk Blouse — Maroon', 'Blouses', 899, 1099, 30, '#800020'],
    ['p8', 'Kids Pattu Pavadai — Green & Pink', 'Kids', 1999, 2399, 5, '#2e7d32'],
  ].map(([id, name, category, price, mrp, stock, tone]) => ({
    id, storeId: 'st_lakshmi', name, category, price, mrp, stock, tone, visible: id !== 'p5', createdAt: ago(50 * D),
  }))
  // The full catalog (js/catalog.js): these 8 placed in a 24-category tree,
  // plus ~1,050 more, every product with variants like the real schema.
  const catalog = buildCatalog({ storeId: 'st_lakshmi', ago, D, base: products })
  const P = Object.fromEntries(catalog.products.map((p) => [p.id, p]))
  /** An order/bill line for a product: its first variant that has stock. */
  const lineOf = (pid, qty) => {
    const p = P[pid]
    const v = p.variants.find((x) => x.stock > 0) || p.variants[0]
    return { productId: pid, variantId: v.id, variantName: v.isDefault ? null : Catalog.variantLabel(v), sku: v.sku, name: p.name, qty, price: v.price, tone: p.tone }
  }

  const customers = [
    ['Anjali Krishnan', '+91 98400 11223', 'anjali.k@gmail.com', '22, 3rd Cross, Indira Nagar, Adyar, Chennai, Tamil Nadu 600020'],
    ['Lakshmi Narayanan', '+91 94440 99812', null, 'Flat 4B, Sree Apartments, RS Puram, Coimbatore, Tamil Nadu 641002'],
    ['Deepa Mohan', '+91 99410 55667', 'deepa.mohan@yahoo.in', '7, Temple Street, Mylapore, Chennai, Tamil Nadu 600004'],
    ['Sneha Pillai', '+91 97450 33221', 'sneha.p@gmail.com', 'TC 12/440, Pattom, Thiruvananthapuram, Kerala 695004'],
    ['Revathi S', '+91 90030 88776', null, '18, Anna Salai, Madurai, Tamil Nadu 625001'],
    ['Kavya Reddy', '+91 98860 44512', 'kavya.r@outlook.com', '301, Lake View Residency, HSR Layout, Bengaluru, Karnataka 560102'],
    ['Meenakshi Iyer', '+91 94450 22018', 'meenakshi.iyer@gmail.com', '5, North Car Street, Srirangam, Tiruchirappalli, Tamil Nadu 620006'],
    ['Nithya Raj', '+91 96000 71234', null, '42, Gandhipuram 2nd Street, Coimbatore, Tamil Nadu 641012'],
  ]

  let n = 1044
  const order = (o) => {
    const [name, phone, email, address] = customers[o.c % customers.length]
    const items = o.items.map(([pid, qty]) => lineOf(pid, qty))
    const subtotal = items.reduce((sum, i) => sum + i.qty * i.price, 0)
    const shipping = subtotal >= 1499 ? 0 : 60
    const number = n++
    const placedAt = ago(o.at)
    const step = (mins) => (mins === undefined ? null : ago(mins))
    return {
      id: `ord_${number}`,
      number: `UM-${number}`,
      storeId: 'st_lakshmi',
      customer: { name, phone, email, address },
      items,
      subtotal,
      shipping,
      total: subtotal + shipping,
      paymentMethod: o.pay,
      paymentStatus: o.pay === 'ONLINE' ? 'PAID' : o.status === 'DELIVERED' ? 'PAID' : 'PENDING',
      status: o.status,
      fulfilment: 'DELIVERY',
      placedAt,
      confirmedAt: step(o.confirmed),
      packedAt: step(o.packed),
      shippedAt: step(o.shipped),
      deliveredAt: step(o.delivered),
      cancelledAt: step(o.cancelled),
      cancelReason: o.reason || null,
      courier: o.shipped !== undefined ? 'DTDC' : null,
      tracking: o.shipped !== undefined ? `D${7000000 + number * 13}` : null,
    }
  }

  const ourOrders = [
    order({ c: 7, at: 18, status: 'PENDING', pay: 'ONLINE', items: [['p2', 1], ['p7', 1]] }),
    order({ c: 4, at: 95, status: 'PENDING', pay: 'COD', items: [['p4', 2]] }),
    order({ c: 1, at: 5 * H, status: 'PENDING', pay: 'ONLINE', items: [['p6', 1]] }),
    order({ c: 0, at: 26 * H, status: 'CONFIRMED', pay: 'ONLINE', confirmed: 24 * H, items: [['p1', 1]] }),
    order({ c: 6, at: 30 * H, status: 'PACKED', pay: 'COD', confirmed: 29 * H, packed: 20 * H, items: [['p8', 1], ['p7', 2]] }),
    order({ c: 2, at: 3 * D, status: 'SHIPPED', pay: 'ONLINE', confirmed: 3 * D - 60, packed: 2.5 * D, shipped: 2 * D, items: [['p3', 1]] }),
    order({ c: 5, at: 4 * D, status: 'SHIPPED', pay: 'COD', confirmed: 4 * D - 90, packed: 3.5 * D, shipped: 3 * D, items: [['p2', 2]] }),
    order({ c: 3, at: 8 * D, status: 'DELIVERED', pay: 'ONLINE', confirmed: 8 * D - 30, packed: 7.6 * D, shipped: 7 * D, delivered: 5 * D, items: [['p1', 1], ['p7', 1]] }),
    order({ c: 1, at: 10 * D, status: 'DELIVERED', pay: 'ONLINE', confirmed: 10 * D - 50, packed: 9.5 * D, shipped: 9 * D, delivered: 6 * D, items: [['p6', 2]] }),
    order({ c: 0, at: 14 * D, status: 'DELIVERED', pay: 'COD', confirmed: 14 * D - 40, packed: 13.5 * D, shipped: 13 * D, delivered: 11 * D, items: [['p4', 3]] }),
    order({ c: 7, at: 18 * D, status: 'DELIVERED', pay: 'ONLINE', confirmed: 18 * D - 20, packed: 17.5 * D, shipped: 17 * D, delivered: 15 * D, items: [['p2', 1]] }),
    order({ c: 4, at: 6 * D, status: 'CANCELLED', pay: 'COD', cancelled: 5.8 * D, reason: 'Customer asked to cancel — ordered by mistake', items: [['p3', 1]] }),
  ]

  // Other shops' orders — admin only, enough to fill its lists.
  const otherOrders = [
    ['st_kovai', 'Ramesh Babu', 2380, 'ONLINE', 'PENDING', 40],
    ['st_malabar', 'Shalini George', 640, 'COD', 'CONFIRMED', 3 * H],
    ['st_urban', 'Pooja Shetty', 1890, 'ONLINE', 'SHIPPED', 20 * H],
    ['st_kovai', 'Hari Prasad', 3150, 'ONLINE', 'DELIVERED', 2 * D],
    ['st_chennai', 'Gayathri V', 1120, 'COD', 'DELIVERED', 3 * D],
    ['st_malabar', 'Joseph Mathew', 890, 'ONLINE', 'DELIVERED', 4 * D],
    ['st_urban', 'Ananya Das', 1450, 'ONLINE', 'CANCELLED', 5 * D],
    ['st_tanjore', 'Suresh Iyer', 8800, 'ONLINE', 'SHIPPED', 22 * D],
  ].map(([storeId, name, total, pay, status, at]) => {
    const number = n++
    return {
      id: `ord_${number}`, number: `UM-${number}`, storeId,
      customer: { name, phone: '+91 90000 00000', email: null, address: 'Tamil Nadu, India' },
      items: [{ productId: null, name: 'Item', qty: 1, price: total, tone: '#999' }],
      subtotal: total, shipping: 0, total, paymentMethod: pay,
      paymentStatus: pay === 'ONLINE' ? 'PAID' : status === 'DELIVERED' ? 'PAID' : 'PENDING',
      status, fulfilment: 'DELIVERY', placedAt: ago(at),
      confirmedAt: null, packedAt: null, shippedAt: null, deliveredAt: status === 'DELIVERED' ? ago(at - 600) : null,
      cancelledAt: status === 'CANCELLED' ? ago(at - 60) : null, cancelReason: null, courier: null, tracking: null,
    }
  })

  // One delivered online order already paid out; the other two wait in admin's "To pay".
  const paidOrder = ourOrders.find((o) => o.number === 'UM-1054')
  const payouts = [
    {
      id: 'po_317', number: 'PO-317', storeId: 'st_lakshmi', orderId: paidOrder.id,
      amount: sellerShare(paidOrder).net, status: 'SUCCEEDED', method: 'PAYMENTHUB', ref: 'PH8F2K19QX',
      createdAt: ago(13 * D), paidAt: ago(13 * D - 5), failReason: null,
    },
    {
      id: 'po_316', number: 'PO-316', storeId: 'st_kovai', orderId: otherOrders[3].id,
      amount: sellerShare(otherOrders[3]).net, status: 'SUCCEEDED', method: 'PAYMENTHUB', ref: 'PH7Z1M04LD',
      createdAt: ago(1.5 * D), paidAt: ago(1.5 * D - 4), failReason: null,
    },
  ]

  const msg = (id, author, authorName, body, at) => ({ id, author, authorName, body, at: ago(at) })
  const tickets = [
    {
      id: 'tk_2042', number: 'T-2042', storeId: 'st_lakshmi', customerId: 'u_priya',
      subject: 'Payout not received for order UM-1052', category: 'PAYOUTS', status: 'IN_PROGRESS', priority: 'HIGH',
      contactEmail: 'priya@lakshmisilks.in', contactPhone: '+91 98450 12345', createdAt: ago(2 * D), lastMessageAt: ago(20 * H),
      messages: [
        msg('m1', 'SELLER', 'Priya Raman', 'Hello, order UM-1052 was delivered 6 days ago and paid online, but I have not received the money in my bank yet. Can you please check?', 2 * D),
        msg('m2', 'ADMIN', 'Anita', 'Hi Priya, thanks for writing. I can see the order. Payouts for online orders are sent after delivery is confirmed — I am checking why this one is waiting and will update you today.', 20 * H),
      ],
    },
    {
      id: 'tk_2039', number: 'T-2039', storeId: 'st_lakshmi', customerId: 'u_priya',
      subject: 'How do I add a size option for blouses?', category: 'PRODUCTS', status: 'RESOLVED', priority: 'NORMAL',
      contactEmail: 'priya@lakshmisilks.in', contactPhone: '+91 98450 12345', createdAt: ago(12 * D), lastMessageAt: ago(11 * D),
      messages: [
        msg('m3', 'SELLER', 'Priya Raman', 'I sell ready-made blouses in 4 sizes. How do I add sizes so customers can choose?', 12 * D),
        msg('m4', 'ADMIN', 'Rahul', 'Open the product, tap "Options", choose "Size" and add 32, 34, 36 and 38. Each size can have its own stock.', 11.5 * D),
        msg('m5', 'SELLER', 'Priya Raman', 'Done, thank you!', 11 * D),
      ],
    },
    {
      id: 'tk_2043', number: 'T-2043', storeId: 'st_chennai', customerId: 'u_karthik',
      subject: 'GST number is not accepted', category: 'STORE_SETUP', status: 'OPEN', priority: 'NORMAL',
      contactEmail: 'karthik.crafts@gmail.com', contactPhone: '+91 90030 77412', createdAt: ago(3 * H), lastMessageAt: ago(3 * H),
      messages: [msg('m6', 'SELLER', 'Karthik S', 'When I type my GSTIN in Business details it says "Check the GST number". It is correct on my certificate.', 3 * H)],
    },
    {
      id: 'tk_2040', number: 'T-2040', storeId: null, customerId: 'u_cust1',
      subject: 'Refund for cancelled order', category: 'PAYMENTS', status: 'OPEN', priority: 'URGENT',
      contactEmail: 'ananya.das@gmail.com', contactPhone: null, createdAt: ago(9 * H), lastMessageAt: ago(9 * H),
      messages: [msg('m7', 'SHOPPER', 'Ananya Das', 'My order from Urban Kurti Studio was cancelled 5 days ago and I still have not got my money back.', 9 * H)],
    },
    {
      id: 'tk_2036', number: 'T-2036', storeId: 'st_tanjore', customerId: 'u_vignesh',
      subject: 'Why is my shop suspended?', category: 'ACCOUNT', status: 'CLOSED', priority: 'HIGH',
      contactEmail: 'vignesh@tanjoreart.in', contactPhone: '+91 93810 44290', createdAt: ago(4 * D), lastMessageAt: ago(3 * D),
      messages: [
        msg('m8', 'SELLER', 'Vignesh Raja', 'My shop shows suspended. Please tell me why.', 4 * D),
        msg('m9', 'ADMIN', 'Anita', 'Hi Vignesh, three customers reported undelivered orders. Please share the courier tracking for UM-1063 and we will review.', 3 * D),
      ],
    },
  ]

  const notifications = [
    { id: 'n1', to: 'seller', title: 'Reply from UnieMax', body: 'Payout not received for order UM-1052', at: ago(20 * H), read: false, go: '/support/tk_2042' },
    { id: 'n2', to: 'seller', title: 'New order UM-1044', body: 'Nithya Raj · ₹5,198', at: ago(18), read: false, go: '/orders/ord_1044' },
    { id: 'n3', to: 'admin', title: 'New ticket from Chennai Craft House', body: 'GST number is not accepted', at: ago(3 * H), read: false, go: '/support/tk_2043' },
  ]

  // ---- Plans & pricing (js/plans.js). Prices and features from the pricing
  // plan; limits, the yearly discount and the trial are starting values the
  // admin edits in Plans & pricing. ----
  const ALL = ['starter', 'growth', 'pro', 'enterprise']
  const GROWTH_UP = ['growth', 'pro', 'enterprise']
  const PRO_UP = ['pro', 'enterprise']
  const feature = (key, group, label, on) => ({ key, group, label, on })
  const planBase = { pricing: 'FIXED', yearly: null, status: 'ACTIVE', featured: false, badge: '', cta: '', feePct: null, createdAt: ago(45 * D) }
  const plans = {
    settings: {
      yearlyDiscountPct: 20, trialDays: 14, trialPlanId: 'growth', afterTrialPlanId: 'starter',
      gstPct: 18, pricesIncludeGst: false, priceChangeRule: 'RENEWAL', salesEmail: 'sales@uniemax.com',
    },
    list: [
      { ...planBase, id: 'starter', order: 1, name: 'Starter', tier: 'Entry', tone: 'success', audience: 'New sellers',
        pitch: 'Everything you need to open your shop and take your first orders.', monthly: 299,
        limits: { products: 100, staff: 1, storageGb: 2 }, otherSellers: 1240 },
      { ...planBase, id: 'growth', order: 2, name: 'Growth', tier: 'Main plan', tone: 'brand', audience: 'Growing businesses',
        pitch: 'The tools most shops need to sell more, every month.', monthly: 699, featured: true, badge: 'Most popular',
        limits: { products: 1000, staff: 2, storageGb: 10 }, otherSellers: 860 },
      { ...planBase, id: 'pro', order: 3, name: 'Pro', tier: 'Advanced', tone: 'info', audience: 'Established sellers',
        pitch: 'Automate the busy work and run your shop with a team.', monthly: 1499,
        limits: { products: null, staff: 5, storageGb: 50 }, otherSellers: 214 },
      { ...planBase, id: 'enterprise', order: 4, name: 'Enterprise', tier: 'Custom', tone: 'neutral', audience: 'Large brands',
        pitch: 'A plan built around your catalogue, your team and your volume.', pricing: 'CUSTOM', monthly: null, cta: 'Talk to us',
        limits: { products: null, staff: null, storageGb: null }, otherSellers: 12 },
    ],
    features: [
      feature('online_store', 'store', 'Basic online store', ALL),
      feature('catalogue', 'store', 'Product catalogue', ALL),
      feature('basic_themes', 'store', 'Basic themes', ALL),
      feature('custom_domain', 'store', 'Custom domain', GROWTH_UP),
      feature('advanced_themes', 'store', 'Advanced themes', GROWTH_UP),
      feature('advanced_customization', 'store', 'Advanced customization', PRO_UP),
      feature('order_management', 'selling', 'Order management', ALL),
      feature('promotions', 'selling', 'Promotions', GROWTH_UP),
      feature('shipping_integrations', 'selling', 'Shipping integrations', GROWTH_UP),
      feature('bulk_upload', 'selling', 'Bulk upload', GROWTH_UP),
      feature('automation', 'selling', 'Automation', PRO_UP),
      feature('analytics', 'insights', 'Analytics', GROWTH_UP),
      feature('advanced_analytics', 'insights', 'Advanced analytics', PRO_UP),
      feature('staff_accounts', 'team', 'Multiple staff accounts', PRO_UP),
      feature('priority_support', 'team', 'Priority support', PRO_UP),
      feature('account_manager', 'team', 'Dedicated account manager', ['enterprise']),
    ],
    history: [
      { id: 'ph2', at: ago(10 * D), by: 'Anita Joseph', text: 'Growth: set as the featured plan · wording updated' },
      { id: 'ph1', at: ago(45 * D), by: 'Anita Joseph', text: 'Created Starter, Growth, Pro and Enterprise' },
    ],
    otherTrials: 186,
  }
  const listPrice = (planId, cycle) => {
    const p = plans.list.find((x) => x.id === planId)
    return cycle === 'YEARLY' ? Math.round(p.monthly * 12 * (1 - plans.settings.yearlyDiscountPct / 100)) : p.monthly
  }
  const addMonths = (iso, months) => {
    const d = new Date(iso)
    d.setMonth(d.getMonth() + months)
    return d.toISOString()
  }
  const subscription = (planId, status, cycle, startedMinutesAgo) => {
    const startedAt = ago(startedMinutesAgo)
    return status === 'TRIAL'
      ? { planId, cycle: 'MONTHLY', status, amount: 0, startedAt, renewsAt: null, trialEndsAt: ago(startedMinutesAgo - plans.settings.trialDays * D), pending: null }
      : { planId, cycle, status, amount: listPrice(planId, cycle), startedAt, renewsAt: addMonths(startedAt, cycle === 'YEARLY' ? 12 : 1), trialEndsAt: null, pending: null }
  }
  const subs = {
    st_lakshmi: kind === 'demo' ? subscription('growth', 'TRIAL', 'MONTHLY', 5 * D) : subscription('growth', 'TRIAL', 'MONTHLY', 0),
    st_kovai: subscription('pro', 'ACTIVE', 'YEARLY', 40 * D),
    st_malabar: subscription('growth', 'ACTIVE', 'MONTHLY', 12 * D),
    st_chennai: subscription('starter', 'ACTIVE', 'MONTHLY', 20 * D),
    st_urban: subscription('growth', 'TRIAL', 'MONTHLY', 3 * D),
    st_tanjore: subscription('starter', 'ACTIVE', 'MONTHLY', 25 * D),
    st_green: subscription('growth', 'TRIAL', 'MONTHLY', 9 * D),
    st_brass: subscription('growth', 'TRIAL', 'MONTHLY', 3 * D),
  }
  stores.forEach((s) => (s.subscription = subs[s.id]))

  // ---- Bills (js/bills.js): link bills waiting / paid / expired, and cash bills ----
  const billWorld = demoBills({ ago, lineOf, customers, H, D, nextOrderSeq: () => n++ })

  const demo = kind === 'demo'
  return {
    version: null,
    rev: 0,
    seq: { order: n - 1, ticket: 2043, payout: 317, msg: 100, notif: 100, plan: 0, planLog: 2, bill: billWorld.seq },
    me: { storeId: 'st_lakshmi' },
    admin: { id: 'a_anita', name: 'Anita Joseph', email: 'anita@uniemax.com', role: 'SUPER_ADMIN' },
    fees: FEES,
    plans,
    owners,
    stores,
    categories: catalog.categories,
    products: catalog.products,
    orders: demo ? [...billWorld.orders, ...ourOrders, ...otherOrders] : otherOrders,
    bills: demo ? billWorld.bills : [],
    payouts: demo ? payouts : payouts.filter((p) => p.storeId !== 'st_lakshmi'),
    tickets: demo ? tickets : tickets.filter((t) => t.storeId !== 'st_lakshmi'),
    notifications: demo ? notifications : notifications.filter((x) => x.to === 'admin'),
  }
}

const demoState = () => buildWorld('demo')

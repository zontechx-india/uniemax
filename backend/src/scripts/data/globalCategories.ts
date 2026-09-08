/**
 * The initial global category taxonomy shipped with every UnieMax install.
 *
 * This is the admin-owned platform tree (`Category`), not a seller's own
 * catalog (`StoreCategory`). Seeded by `scripts/seedCategories.ts`.
 *
 * Order in this file is meaningful: a node's index among its siblings becomes
 * its `displayOrder`. Slugs are derived from the names (see `deriveSlug` in
 * the seed script) — set `slug` explicitly only to pin one that must never
 * move, e.g. because a derived slug already went out in a URL.
 *
 * `children` nests arbitrarily deep even though this first taxonomy is two
 * levels; the seeder and `Category.parentId` both handle any depth. Sellers
 * will later be able to propose additions through the (separate) category
 * suggestion workflow — nothing here is meant to be the final list.
 */
export type SeedCategory = {
  name: string;
  /** Pin a slug instead of deriving it from `name`. */
  slug?: string;
  children?: SeedCategory[];
};

export const GLOBAL_CATEGORIES: SeedCategory[] = [
  {
    name: "Automotive",
    children: [
      { name: "Motorcycle Parts" },
      { name: "Car Parts" },
      { name: "Motorcycle Accessories" },
      { name: "Car Accessories" },
      { name: "Oils & Fluids" },
    ],
  },
  {
    name: "Fashion",
    children: [
      { name: "Men" },
      { name: "Women" },
      { name: "Kids" },
      { name: "Fashion Accessories" },
    ],
  },
  {
    name: "Electronics",
    children: [
      { name: "Mobiles" },
      { name: "Tablets" },
      { name: "Cameras" },
      { name: "Audio" },
      { name: "Accessories" },
    ],
  },
  {
    name: "Computers & Accessories",
    children: [
      { name: "Laptops" },
      { name: "Desktops" },
      { name: "Computer Components" },
      { name: "Monitors" },
      { name: "Computer Accessories" },
      { name: "Storage" },
    ],
  },
  {
    name: "Home & Kitchen",
    children: [
      { name: "Kitchen" },
      { name: "Furniture" },
      { name: "Home Decor" },
      { name: "Storage & Organization" },
      { name: "Cleaning" },
    ],
  },
  {
    name: "Beauty & Personal Care",
    children: [
      { name: "Skincare" },
      { name: "Haircare" },
      { name: "Makeup" },
      { name: "Grooming" },
      { name: "Personal Care" },
    ],
  },
  {
    name: "Health & Wellness",
    children: [
      { name: "Personal Care" },
      { name: "Fitness & Wellness" },
      { name: "Healthcare Products" },
    ],
  },
  {
    name: "Sports & Fitness",
    children: [
      { name: "Fitness Equipment" },
      { name: "Outdoor Sports" },
      { name: "Team Sports" },
      { name: "Yoga" },
      { name: "Sports Accessories" },
    ],
  },
  {
    name: "Toys & Games",
    children: [
      { name: "Toys" },
      { name: "Board Games" },
      { name: "Educational Toys" },
      { name: "Puzzles" },
      { name: "Gaming" },
    ],
  },
  {
    name: "Baby & Kids",
    children: [
      { name: "Baby Clothing" },
      { name: "Baby Care" },
      { name: "Feeding" },
      { name: "Diapers" },
      { name: "Baby Accessories" },
    ],
  },
  {
    name: "Grocery & Food",
    children: [
      { name: "Staples" },
      { name: "Snacks" },
      { name: "Beverages" },
      { name: "Packaged Food" },
      { name: "Cooking Essentials" },
    ],
  },
  {
    name: "Pet Supplies",
    children: [
      { name: "Dog Supplies" },
      { name: "Cat Supplies" },
      { name: "Pet Food" },
      { name: "Pet Accessories" },
      { name: "Fish & Aquarium" },
    ],
  },
  {
    name: "Books & Stationery",
    children: [
      { name: "Books" },
      { name: "Stationery" },
      { name: "School Supplies" },
      { name: "Office Supplies" },
    ],
  },
  {
    name: "Jewelry & Accessories",
    children: [
      { name: "Jewelry" },
      { name: "Watches" },
      { name: "Sunglasses" },
      { name: "Fashion Accessories" },
    ],
  },
  {
    name: "Shoes & Footwear",
    children: [
      { name: "Men" },
      { name: "Women" },
      { name: "Kids" },
      { name: "Sports Shoes" },
      { name: "Sandals & Slippers" },
    ],
  },
  {
    name: "Bags & Luggage",
    children: [
      { name: "Backpacks" },
      { name: "Handbags" },
      { name: "Travel Bags" },
      { name: "Suitcases" },
      { name: "Wallets" },
    ],
  },
  {
    name: "Furniture",
    children: [
      { name: "Living Room" },
      { name: "Bedroom" },
      { name: "Office Furniture" },
      { name: "Outdoor Furniture" },
      { name: "Storage Furniture" },
    ],
  },
  {
    name: "Garden & Outdoor",
    children: [
      { name: "Gardening" },
      { name: "Plants" },
      { name: "Garden Tools" },
      { name: "Outdoor Living" },
    ],
  },
  {
    name: "Tools & Hardware",
    children: [
      { name: "Hand Tools" },
      { name: "Power Tools" },
      { name: "Hardware" },
      { name: "Tool Accessories" },
    ],
  },
  {
    name: "Electrical",
    children: [
      { name: "Lighting" },
      { name: "Switches & Sockets" },
      { name: "Cables & Wires" },
      { name: "Electrical Accessories" },
    ],
  },
  {
    name: "Appliances",
    children: [
      { name: "Kitchen Appliances" },
      { name: "Home Appliances" },
      { name: "Personal Appliances" },
    ],
  },
  {
    name: "Home Improvement",
    children: [
      { name: "Plumbing" },
      { name: "Paint & Supplies" },
      { name: "Bathroom" },
      { name: "Building Materials" },
    ],
  },
  {
    name: "Office & Business",
    children: [
      { name: "Office Equipment" },
      { name: "Printing" },
      { name: "Office Furniture" },
      { name: "Business Supplies" },
    ],
  },
  {
    name: "Industrial & Commercial",
    children: [
      { name: "Machinery" },
      { name: "Industrial Supplies" },
      { name: "Commercial Equipment" },
      { name: "Material Handling" },
    ],
  },
  {
    name: "Arts & Crafts",
    children: [
      { name: "Art Supplies" },
      { name: "Craft Supplies" },
      { name: "Sewing & Fabric" },
      { name: "DIY" },
    ],
  },
  {
    name: "Musical Instruments",
    children: [
      { name: "Guitars" },
      { name: "Keyboards" },
      { name: "Drums" },
      { name: "Wind Instruments" },
      { name: "Accessories" },
    ],
  },
  {
    name: "Travel & Lifestyle",
    children: [
      { name: "Travel Accessories" },
      { name: "Outdoor Gear" },
      { name: "Lifestyle Products" },
    ],
  },
  {
    name: "Hobbies & Collectibles",
    children: [
      { name: "Collectibles" },
      { name: "Models" },
      { name: "Hobby Supplies" },
      { name: "Craft Hobbies" },
    ],
  },
  {
    name: "Other",
    children: [{ name: "Other Products" }],
  },
];

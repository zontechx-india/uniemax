import type { OptionTemplate } from "../../modules/category/categoryTemplates.js";

/**
 * Starting suggestions for the product form, per taxonomy slug: which option
 * types (with the values most Indian sellers use) and which specification
 * labels a product filed there usually has. Seeded once by
 * `seedCategories.ts` where nothing has been set, then owned by admins in
 * `/admin/categories`. Children inherit from their parent unless they have
 * their own entry, so a root's presets cover its whole branch.
 */
export const CATEGORY_PRESETS: Record<
  string,
  { options?: OptionTemplate[]; specs?: string[] }
> = {
  fashion: {
    options: [
      { name: "Size", values: ["XS", "S", "M", "L", "XL", "XXL", "3XL"] },
      { name: "Colour", values: ["Black", "White", "Red", "Blue", "Navy", "Green", "Yellow", "Pink", "Grey", "Beige", "Maroon", "Brown"] },
    ],
    specs: ["Fabric", "Fit", "Pattern", "Sleeve", "Wash care", "Occasion"],
  },
  "fashion-women": {
    options: [
      { name: "Size", values: ["Free Size", "XS", "S", "M", "L", "XL", "XXL", "3XL"] },
      { name: "Colour", values: ["Black", "White", "Red", "Blue", "Navy", "Green", "Yellow", "Pink", "Grey", "Beige", "Maroon", "Brown"] },
    ],
    specs: ["Fabric", "Fit", "Pattern", "Work", "Wash care", "Occasion"],
  },
  "fashion-kids": {
    options: [
      { name: "Age", values: ["0-3 M", "3-6 M", "6-12 M", "1-2 Y", "2-3 Y", "3-4 Y", "4-5 Y", "5-6 Y", "6-7 Y", "7-8 Y", "8-9 Y", "9-10 Y", "10-12 Y", "12-14 Y"] },
      { name: "Colour", values: ["Black", "White", "Red", "Blue", "Green", "Yellow", "Pink", "Grey"] },
    ],
    specs: ["Fabric", "Pattern", "Wash care"],
  },
  "shoes-footwear": {
    options: [
      { name: "Size (UK)", values: ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] },
      { name: "Colour", values: ["Black", "White", "Brown", "Tan", "Grey", "Blue", "Red"] },
    ],
    specs: ["Material", "Sole", "Closure", "Occasion"],
  },
  "shoes-footwear-kids": {
    options: [
      { name: "Size (UK)", values: ["5C", "6C", "7C", "8C", "9C", "10C", "11C", "12C", "13C", "1", "2", "3", "4", "5"] },
      { name: "Colour", values: ["Black", "White", "Blue", "Pink", "Red"] },
    ],
    specs: ["Material", "Sole", "Closure"],
  },
  electronics: {
    options: [{ name: "Colour", values: ["Black", "White", "Silver", "Blue", "Grey"] }],
    specs: ["Brand", "Model", "Warranty"],
  },
  "electronics-mobiles": {
    options: [
      { name: "Storage", values: ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB"] },
      { name: "Colour", values: ["Black", "White", "Blue", "Green", "Purple", "Gold", "Silver", "Titanium"] },
    ],
    specs: ["Brand", "Model", "RAM", "Display", "Battery", "Camera", "Warranty"],
  },
  "electronics-tablets": {
    options: [
      { name: "Storage", values: ["64 GB", "128 GB", "256 GB", "512 GB"] },
      { name: "Connectivity", values: ["Wi-Fi", "Wi-Fi + 5G"] },
    ],
    specs: ["Brand", "Model", "Display", "Battery", "Warranty"],
  },
  "electronics-audio": {
    options: [{ name: "Colour", values: ["Black", "White", "Blue", "Grey"] }],
    specs: ["Brand", "Type", "Battery life", "Connectivity", "Warranty"],
  },
  "computers-accessories": { specs: ["Brand", "Model", "Warranty"] },
  "computers-accessories-laptops": {
    options: [
      { name: "RAM", values: ["8 GB", "16 GB", "32 GB"] },
      { name: "Storage", values: ["256 GB SSD", "512 GB SSD", "1 TB SSD"] },
    ],
    specs: ["Brand", "Processor", "Display", "Graphics", "Operating system", "Warranty"],
  },
  "home-kitchen": {
    options: [{ name: "Colour", values: ["Black", "White", "Grey", "Beige", "Blue", "Green"] }],
    specs: ["Material", "Dimensions", "Weight", "Care"],
  },
  kitchen: {
    options: [{ name: "Capacity", values: ["500 ml", "1 L", "1.5 L", "2 L", "3 L", "5 L"] }],
    specs: ["Material", "Dishwasher safe", "Induction compatible", "Warranty"],
  },
  furniture: {
    options: [{ name: "Finish", values: ["Walnut", "Teak", "Oak", "Natural", "Black", "White"] }],
    specs: ["Material", "Dimensions", "Weight", "Assembly", "Warranty"],
  },
  "beauty-personal-care": {
    options: [{ name: "Size", values: ["30 ml", "50 ml", "100 ml", "200 ml", "500 ml"] }],
    specs: ["Skin type", "Key ingredients", "Shelf life", "Country of origin"],
  },
  "grocery-food": {
    options: [{ name: "Pack size", values: ["100 g", "250 g", "500 g", "1 kg", "2 kg", "5 kg"] }],
    specs: ["Ingredients", "Shelf life", "Veg / Non-veg", "FSSAI licence"],
  },
  "jewelry-accessories": {
    options: [{ name: "Material", values: ["Gold", "Silver", "Rose gold", "Oxidised", "Brass"] }],
    specs: ["Material", "Purity", "Weight", "Stone"],
  },
  "jewelry-accessories-watches": {
    options: [{ name: "Colour", values: ["Black", "Silver", "Gold", "Rose gold", "Brown"] }],
    specs: ["Brand", "Dial size", "Strap", "Water resistance", "Warranty"],
  },
  "bags-luggage": {
    options: [{ name: "Colour", values: ["Black", "Brown", "Tan", "Navy", "Grey", "Red"] }],
    specs: ["Material", "Capacity", "Dimensions", "Warranty"],
  },
  "sports-fitness": {
    options: [
      { name: "Size", values: ["S", "M", "L", "XL"] },
      { name: "Colour", values: ["Black", "White", "Blue", "Red", "Grey"] },
    ],
    specs: ["Material", "Weight", "Suitable for"],
  },
  "toys-games": { specs: ["Age group", "Material", "Batteries"] },
  "baby-kids": {
    options: [{ name: "Age", values: ["Newborn", "0-3 M", "3-6 M", "6-12 M", "12-18 M", "18-24 M"] }],
    specs: ["Age group", "Material"],
  },
  "pet-supplies": {
    options: [{ name: "Size", values: ["S", "M", "L", "XL"] }],
    specs: ["Suitable for", "Life stage", "Ingredients"],
  },
  "books-stationery": { specs: ["Author", "Publisher", "Language", "Pages", "Binding"] },
  appliances: {
    options: [{ name: "Colour", values: ["Black", "White", "Silver", "Grey"] }],
    specs: ["Brand", "Model", "Capacity", "Power", "Warranty"],
  },
  automotive: { specs: ["Compatible vehicles", "Brand", "Warranty"] },
  "garden-outdoor": { specs: ["Material", "Dimensions"] },
  "tools-hardware": { specs: ["Brand", "Material", "Warranty"] },
  electrical: { specs: ["Brand", "Wattage", "Voltage", "Warranty"] },
  "arts-crafts": { specs: ["Material", "Quantity"] },
  "musical-instruments": { specs: ["Brand", "Material"] },
};

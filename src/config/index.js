export const APP_CONFIG = {
  name: "Placebo Finance Hub",
  description: "Financial document management and credit-card reconciliation",
  version: "2.0.0",
  defaultCurrency: "ILS",
  supportedCurrencies: [
    "ILS", "EUR", "USD", "GBP", "CHF", "SEK",
  ],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  acceptedDocumentTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  acceptedStatementTypes: ["application/pdf", "text/csv"],
  defaultCategories: [
    "Travel & Transport",
    "Accommodation",
    "Meals & Entertainment",
    "Office Supplies",
    "Software & Subscriptions",
    "Marketing & Advertising",
    "Professional Services",
    "Utilities",
    "Rent & Facilities",
    "Equipment",
    "Training & Education",
    "Healthcare",
    "Insurance",
    "Other",
  ],
  paymentMethods: [
    { value: "credit_card", label: "Credit Card" },
    { value: "bank_transfer", label: "Bank Transfer" },
    { value: "cash", label: "Cash" },
    { value: "other", label: "Other" },
    { value: "unknown", label: "Unknown" },
  ],
  documentTypes: [
    { value: "receipt", label: "Receipt" },
    { value: "invoice", label: "Invoice" },
    { value: "credit_note", label: "Credit Note" },
    { value: "other", label: "Other" },
  ],
};

/**
 * Demo credentials — NOT production auth.
 * Replace with real auth before going live.
 */
export const DEMO_USERS = [
  {
    id: "user-owner",
    username: "Placeboadmin",
    password: "Placebo2026",
    email: "admin@placebo.local",
    fullName: "Placebo Admin",
    role: "owner",
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "user-manager",
    username: "finance",
    password: "Finance2026",
    email: "finance@placebo.local",
    fullName: "Finance Manager",
    role: "manager",
    isActive: true,
    createdAt: new Date().toISOString(),
  },
];

export const ROUTES = {
  home: "/",
  login: "/login",
  dashboard: "/dashboard",
  documents: {
    list: "/documents",
    upload: "/documents/upload",
    review: "/documents/review",
    reviewItem: (id) => `/documents/review/${id}`,
  },
  expenses: "/expenses",
  transactions: "/transactions",
  reconciliation: "/reconciliation",
  reports: "/reports",
  vendors: "/vendors",
  users: "/users",
  settings: "/settings",
};

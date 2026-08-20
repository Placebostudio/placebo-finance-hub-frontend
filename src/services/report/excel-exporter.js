/**
 * Excel export for monthly financial reports.
 * Uses SheetJS (xlsx) — entirely client-side, no server required.
 *
 * Generates a workbook with four sheets:
 *   Summary       — key metrics for the period
 *   Expenses      — all expense records with reconciliation status
 *   Transactions  — all CC transactions for the period
 *   Reconciliation — confirmed match pairs
 */

/** Trigger a browser download of a Blob. */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Format ISO date as DD/MM/YYYY, or blank if empty. */
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Format payment method. */
function fmtPayment(method) {
  return {
    credit_card: 'Credit Card',
    bank_transfer: 'Bank Transfer',
    cash: 'Cash',
    other: 'Other',
    unknown: 'Unknown',
  }[method] ?? method ?? '';
}

/**
 * Build and download an Excel workbook for the given period.
 *
 * @param {{
 *   period: string,
 *   periodLabel: string,
 *   companyName: string,
 *   expenses: object[],
 *   transactions: object[],
 *   confirmedMatches: object[],
 *   unmatchedTxns: object[],
 *   expensesWithoutCharge: object[],
 *   nonCcExpenses: object[],
 * }} reportData
 */
export async function exportToExcel(reportData) {
  const {
    period,
    periodLabel,
    companyName,
    expenses,
    transactions,
    confirmedMatches,
    unmatchedTxns,
    expensesWithoutCharge,
    nonCcExpenses,
  } = reportData;

  // Dynamic import to keep xlsx out of the server bundle
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ─────────────────────────────────────────────────────────
  const approvedExpenses = expenses.filter((e) => e.status === 'approved');
  const ccExpenses = approvedExpenses.filter((e) => e.paymentMethod === 'credit_card');
  const totalGross = approvedExpenses.reduce((s, e) => s + (e.grossAmount ?? 0), 0);
  const totalNet = approvedExpenses.reduce((s, e) => s + (e.netAmount ?? 0), 0);
  const totalVat = approvedExpenses.reduce((s, e) => s + (e.vatAmount ?? 0), 0);

  const matchedExpenseIds = new Set(confirmedMatches.map((m) => m.expenseId));
  const matchedTxnIds = new Set(confirmedMatches.map((m) => m.transactionId));

  const summaryRows = [
    ['Report Period', periodLabel],
    ['Company', companyName],
    ['Generated', fmtDate(new Date().toISOString())],
    [],
    ['EXPENSES'],
    ['Total Expenses', expenses.length],
    ['Approved', approvedExpenses.length],
    ['Draft', expenses.filter((e) => e.status === 'draft').length],
    [],
    ['AMOUNTS (approved)'],
    ['Total Net', totalNet],
    ['Total VAT', totalVat],
    ['Total Gross', totalGross],
    [],
    ['CREDIT CARD RECONCILIATION'],
    ['CC Expenses', ccExpenses.length],
    ['CC Expenses Matched', ccExpenses.filter((e) => matchedExpenseIds.has(e.id)).length],
    ['CC Transactions', transactions.length],
    ['CC Transactions Matched', transactions.filter((t) => matchedTxnIds.has(t.id)).length],
    ['Missing Receipts', unmatchedTxns.length],
    ['CC Expenses Without Charge', expensesWithoutCharge.length],
    [],
    ['NON-CC PAYMENTS'],
    ['Cash / Bank / Other', nonCcExpenses.length],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ── Sheet 2: Expenses ────────────────────────────────────────────────────────
  const expenseRows = expenses.map((e) => {
    const match = confirmedMatches.find((m) => m.expenseId === e.id);
    const matchedTxn = match ? transactions.find((t) => t.id === match.transactionId) : null;
    return {
      'Date': fmtDate(e.documentDate),
      'Vendor': e.vendorName ?? '',
      'Doc Number': e.documentNumber ?? '',
      'Doc Type': e.documentType ?? '',
      'Category': e.category ?? '',
      'Payment Method': fmtPayment(e.paymentMethod),
      'Currency': e.currency ?? '',
      'Net Amount': e.netAmount ?? 0,
      'VAT Rate %': e.vatRate ?? 0,
      'VAT Amount': e.vatAmount ?? 0,
      'Gross Amount': e.grossAmount ?? 0,
      'Status': e.status ?? '',
      'Due Date': fmtDate(e.dueDate),
      'Reconciliation': match ? 'Matched' : (e.paymentMethod === 'credit_card' ? 'Unmatched CC' : 'N/A'),
      'Matched Txn Date': matchedTxn ? fmtDate(matchedTxn.transactionDate) : '',
      'Matched Txn Description': matchedTxn?.description ?? '',
      'Matched Txn Amount': matchedTxn ? Math.abs(matchedTxn.billedAmount ?? 0) : '',
      'Notes': e.notes ?? '',
    };
  });

  const wsExpenses = XLSX.utils.json_to_sheet(expenseRows.length > 0 ? expenseRows : [{}]);
  wsExpenses['!cols'] = [
    { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 18 },
    { wch: 16 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
    { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
    { wch: 28 }, { wch: 16 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsExpenses, 'Expenses');

  // ── Sheet 3: CC Transactions ─────────────────────────────────────────────────
  const txnRows = transactions.map((t) => ({
    'Transaction Date': fmtDate(t.transactionDate),
    'Posting Date': fmtDate(t.postingDate),
    'Description': t.description ?? '',
    'Card Last 4': t.cardLastFour ? `****${t.cardLastFour}` : '',
    'Original Amount': t.originalAmount ?? 0,
    'Original Currency': t.originalCurrency ?? '',
    'Billed Amount': Math.abs(t.billedAmount ?? 0),
    'Billed Currency': t.billedCurrency ?? '',
    'Status': t.status ?? '',
    'Reconciliation': matchedTxnIds.has(t.id) ? 'Matched' : (t.status === 'ignored' ? 'Ignored' : 'Unmatched'),
  }));

  const wsTransactions = XLSX.utils.json_to_sheet(txnRows.length > 0 ? txnRows : [{}]);
  wsTransactions['!cols'] = [
    { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 12 },
    { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTransactions, 'CC Transactions');

  // ── Sheet 4: Reconciliation ──────────────────────────────────────────────────
  const matchRows = confirmedMatches.map((m) => {
    const exp = expenses.find((e) => e.id === m.expenseId);
    const txn = transactions.find((t) => t.id === m.transactionId);
    return {
      'Match Score': m.score ?? '',
      'Match Type': m.matchType ?? '',
      'Expense Vendor': exp?.vendorName ?? '',
      'Expense Date': fmtDate(exp?.documentDate),
      'Expense Amount': exp?.grossAmount ?? 0,
      'Expense Currency': exp?.currency ?? '',
      'Transaction Description': txn?.description ?? '',
      'Transaction Date': fmtDate(txn?.transactionDate),
      'Transaction Amount': Math.abs(txn?.billedAmount ?? 0),
      'Transaction Currency': txn?.billedCurrency ?? '',
      'Match Reasons': (m.reasons ?? []).join('; '),
      'Confirmed At': fmtDate(m.confirmedAt),
    };
  });

  const wsMatches = XLSX.utils.json_to_sheet(matchRows.length > 0 ? matchRows : [{}]);
  wsMatches['!cols'] = [
    { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 10 },
    { wch: 30 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 40 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMatches, 'Reconciliation');

  // ── Download ─────────────────────────────────────────────────────────────────
  const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbArray], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, `financial-report-${period}.xlsx`);
}

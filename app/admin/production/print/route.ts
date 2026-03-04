import { NextRequest, NextResponse } from 'next/server';
import { createClient } from "@/lib/supabase/server";

// ── Category ranges ───────────────────────────────────────────────────────────
const CATEGORIES = [
  { label: 'All',               min: 0,    max: 99999 },
  { label: 'Cakes (1000-1999)', min: 1000, max: 1999  },
  { label: 'Bread (2000-2749)', min: 2000, max: 2749  },
  { label: 'Rolls (2750-3750)', min: 2750, max: 3750  },
  { label: 'Pies (3751-4000)',  min: 3751, max: 4000  },
]

async function checkAdmin() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const adminEmails = ['debs_bakery@outlook.com', 'admin@allstarsbakery.com'];
    return adminEmails.includes(user.email?.toLowerCase() || '');
  } catch {
    return false;
  }
}

function getBrisbaneDate(): string {
  const now      = new Date();
  const brisbane = new Date(now.getTime() + 10 * 60 * 60 * 1000);
  return brisbane.toISOString().split('T')[0];
}

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00.000Z');
  return d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
}

function formatDate(dateStr: string, opts: Intl.DateTimeFormatOptions): string {
  const d = new Date(dateStr + 'T12:00:00.000Z');
  return d.toLocaleDateString('en-AU', opts);
}

async function getCombinedForecast(dates: string[], supabase: any) {
  const products: Record<string, any> = {};
  let totalOrders    = 0;
  let totalConfirmed = 0;
  let totalProjected = 0;

  for (const date of dates) {
    const { data: orders } = await supabase
      .from('orders')
      .select(`
        id, delivery_date, source, customer_id,
        items:order_items(
          product_id, product_name, quantity,
          product:products(code, name, unit, category)
        )
      `)
      .eq('delivery_date', date)
      .in('status', ['pending', 'confirmed', 'in_production']);

    const dayOfWeek = getDayOfWeek(date);

    const { data: standingOrders } = await supabase
      .from('standing_orders')
      .select(`
        customer_id,
        items:standing_order_items(
          product_id, quantity,
          product:products(code, name, unit, category)
        )
      `)
      .eq('delivery_day', dayOfWeek)
      .eq('active', true);

    const customerIdsWithOrders = new Set<string>();

    if (orders) {
      orders.forEach((order: any) => {
        customerIdsWithOrders.add(order.customer_id);
        totalConfirmed++;
        totalOrders++;
        if (order.items) {
          order.items.forEach((item: any) => {
            const key = item.product_id;
            if (!products[key]) {
              products[key] = {
                code:         item.product?.code || 0,
                product_name: item.product?.name || item.product_name,
                unit:         item.product?.unit || 'unit',
                category:     item.product?.category || '',
                quantity:     0,
                sources: {
                  manual:                   0,
                  standing_order_confirmed: 0,
                  standing_order_projected: 0,
                  online:                   0,
                },
              };
            }
            products[key].quantity += item.quantity;
            if (order.source === 'standing_order')
              products[key].sources.standing_order_confirmed += item.quantity;
            else if (order.source === 'online')
              products[key].sources.online += item.quantity;
            else
              products[key].sources.manual += item.quantity;
          });
        }
      });
    }

    if (standingOrders) {
      standingOrders.forEach((so: any) => {
        if (!customerIdsWithOrders.has(so.customer_id)) {
          totalProjected++;
          totalOrders++;
          if (so.items) {
            so.items.forEach((item: any) => {
              const key = item.product_id;
              if (!products[key]) {
                products[key] = {
                  code:         item.product?.code || 0,
                  product_name: item.product?.name || 'Unknown',
                  unit:         item.product?.unit || 'unit',
                  category:     item.product?.category || '',
                  quantity:     0,
                  sources: {
                    manual:                   0,
                    standing_order_confirmed: 0,
                    standing_order_projected: 0,
                    online:                   0,
                  },
                };
              }
              products[key].quantity += item.quantity;
              products[key].sources.standing_order_projected += item.quantity;
            });
          }
        }
      });
    }
  }

  const productsArray = Object.values(products)
    .sort((a: any, b: any) => Number(a.code) - Number(b.code));

  const grandTotal = productsArray.reduce((sum, p: any) => sum + p.quantity, 0);

  return { products: productsArray, grandTotal, totalOrders, totalConfirmed, totalProjected };
}

export async function GET(request: NextRequest) {
  const isAdmin = await checkAdmin();
  if (!isAdmin) return new NextResponse('Unauthorized', { status: 401 });

  const { searchParams } = new URL(request.url);
  const autoPrint = searchParams.get('autoprint') === '1';

  const datesParam = searchParams.get('dates');
  const dateParam  = searchParams.get('date');
  const minCode    = parseInt(searchParams.get('min') ?? '0',     10);
  const maxCode    = parseInt(searchParams.get('max') ?? '99999', 10);

  const todayBrisbane = getBrisbaneDate();

  const dates: string[] = datesParam
    ? datesParam.split(',').map(d => d.trim()).filter(Boolean)
    : dateParam
    ? [dateParam]
    : [todayBrisbane];

  const rangeStart = dates[0]                ?? todayBrisbane;
  const rangeEnd   = dates[dates.length - 1] ?? todayBrisbane;

  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all products then filter by code range
  const { products: allProducts, grandTotal: _rawTotal, totalOrders, totalConfirmed, totalProjected }
    = await getCombinedForecast(dates, supabase);

  const products = allProducts.filter((p: any) => {
    const c = Number(p.code);
    return c >= minCode && c <= maxCode;
  });
  const grandTotal = products.reduce((sum: number, p: any) => sum + p.quantity, 0);

  // ── Page title ────────────────────────────────────────────────────────────
  const pageTitle = dates.length === 1
    ? formatDate(dates[0], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${formatDate(dates[0], { weekday: 'short', day: 'numeric', month: 'short' })} to ${
        formatDate(dates[dates.length - 1], { weekday: 'short', day: 'numeric', month: 'short' })}`;

  // ── Active category label for the header ─────────────────────────────────
  const activeCat = CATEGORIES.find(c => c.min === minCode && c.max === maxCode);
  const filterLabel = activeCat && activeCat.min !== 0
    ? activeCat.label
    : (minCode > 0 || maxCode < 99999)
      ? `Codes ${minCode} - ${maxCode}`
      : '';

  const printedAt = new Date(new Date().getTime() + 10 * 60 * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 16);

  // ── Category button HTML ──────────────────────────────────────────────────
  const catButtons = CATEGORIES.map(cat => {
    const isActive = cat.min === minCode && cat.max === maxCode;
    return `<button
      class="preset-btn cat-btn${isActive ? ' cat-active' : ''}"
      onclick="setCategory(${cat.min}, ${cat.max})"
    >${cat.label}</button>`;
  }).join('\n        ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Production Sheet - ${pageTitle}${filterLabel ? ' - ' + filterLabel : ''}</title>
  <style>
    @media print {
      @page { margin: 0.3in; }
      .no-print { display: none !important; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 9pt; padding: 12px; }

    .controls {
      padding: 12px 16px; background: #f5f5f5;
      margin-bottom: 16px; border-radius: 6px; border: 1px solid #ddd;
    }
    .controls h3 { margin-bottom: 10px; font-size: 11pt; }
    .range-row {
      display: flex; align-items: flex-end;
      gap: 10px; flex-wrap: wrap; margin-bottom: 10px;
    }
    .range-row label {
      display: flex; flex-direction: column;
      gap: 3px; font-size: 9pt; font-weight: bold; color: #444;
    }
    .range-row input[type="date"] {
      padding: 5px 8px; border: 1px solid #ccc;
      border-radius: 4px; font-size: 10pt;
    }
    .section-label {
      font-size: 9pt; font-weight: bold; color: #444; margin-bottom: 6px;
    }
    .preset-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    .preset-btn {
      padding: 4px 10px; font-size: 9pt; border: 1px solid #ccc;
      border-radius: 4px; background: white; cursor: pointer;
    }
    .preset-btn:hover { background: #e8f5e9; border-color: #006A4E; }
    .cat-active {
      background: #006A4E !important; color: white !important;
      border-color: #006A4E !important;
    }
    .custom-range-row {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 10px; flex-wrap: wrap;
    }
    .custom-range-row label {
      font-size: 9pt; font-weight: bold; color: #444;
    }
    .custom-range-row input[type="number"] {
      width: 90px; padding: 4px 8px; border: 1px solid #ccc;
      border-radius: 4px; font-size: 9pt;
    }
    .custom-range-row span { color: #666; font-size: 9pt; }
    .action-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn {
      padding: 7px 16px; border: none; border-radius: 4px;
      cursor: pointer; font-weight: bold; font-size: 10pt;
      text-decoration: none; display: inline-block;
    }
    .btn-view  { background: white; color: #006A4E; border: 2px solid #006A4E; }
    .btn-print { background: #CE1126; color: white; }
    .btn-back  { background: #666; color: white; }

    .page-header {
      margin-bottom: 10px; padding-bottom: 6px;
      border-bottom: 2px solid #006A4E;
    }
    .page-header h1 { color: #006A4E; font-size: 16pt; margin-bottom: 2px; }
    .page-header .subtitle { font-size: 12pt; font-weight: bold; margin-bottom: 2px; }
    .page-header .filter-badge {
      display: inline-block; background: #006A4E; color: white;
      font-size: 8pt; font-weight: bold; padding: 2px 8px;
      border-radius: 10px; margin-top: 3px;
    }
    .page-header .summary { font-size: 8pt; color: #444; margin-top: 4px; }

    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th, td { border: 1px solid #555; padding: 4px 6px; }
    th {
      background: #006A4E; color: white;
      font-weight: bold; text-transform: uppercase; font-size: 8pt;
    }
    tr:nth-child(even) { background: #f5f5f5; }
    .total-row {
      background: #d4edda !important;
      font-weight: bold; border-top: 2px solid #333;
    }
    .signoff {
      margin-top: 16px; border-top: 1px solid #ccc;
      padding-top: 12px; display: flex;
      justify-content: space-between; gap: 20px; font-size: 9pt;
    }
    .signoff div p { margin-bottom: 24px; }
  </style>
</head>
<body>

  <!-- ── Controls (hidden on print) ── -->
  <div class="controls no-print">
    <h3>Production Sheet</h3>

    <!-- Date range -->
    <div class="range-row">
      <label>
        Start Date
        <input type="date" id="startDate" value="${rangeStart}">
      </label>
      <label>
        End Date
        <input type="date" id="endDate" value="${rangeEnd}">
      </label>
    </div>

    <!-- Date presets -->
    <div class="preset-row">
      <button class="preset-btn" onclick="setPreset(0,0)">Today</button>
      <button class="preset-btn" onclick="setPreset(1,1)">Tomorrow</button>
      <button class="preset-btn" onclick="setPreset(0,1)">Today + Tomorrow</button>
      <button class="preset-btn" onclick="setPreset(1,7)">Next 7 Days</button>
    </div>

    <!-- Category filter -->
    <p class="section-label">Filter by Category:</p>
    <div class="preset-row">
      ${catButtons}
    </div>

    <!-- Custom code range -->
    <div class="custom-range-row">
      <label>Custom range:</label>
      <input type="number" id="minCode" value="${minCode === 0 ? '' : minCode}" placeholder="Min code" min="0">
      <span>to</span>
      <input type="number" id="maxCode" value="${maxCode === 99999 ? '' : maxCode}" placeholder="Max code" min="0">
    </div>

    <!-- Actions -->
    <div class="action-row">
      <button onclick="loadRange(false)" class="btn btn-view">View</button>
      <button onclick="loadRange(true)"  class="btn btn-print">Print</button>
      <a href="/admin/production" class="btn btn-back">Back</a>
    </div>
  </div>

  <!-- ── Page header ── -->
  <div class="page-header">
    <h1>Production Sheet</h1>
    <div class="subtitle">${pageTitle}</div>
    ${filterLabel
      ? `<div><span class="filter-badge">${filterLabel}</span></div>`
      : ''}
    <div class="summary">
      Orders: <strong>${totalOrders}</strong>
      (${totalConfirmed} confirmed${totalProjected > 0 ? `, ${totalProjected} projected` : ''})
      &nbsp;|&nbsp; Products shown: <strong>${products.length}</strong>
      &nbsp;|&nbsp; Total items: <strong>${grandTotal}</strong>
      &nbsp;|&nbsp; Printed: ${printedAt} (Brisbane)
    </div>
  </div>

  <!-- ── Table ── -->
  ${products.length === 0 ? `
    <p style="text-align:center; padding:40px; color:#666; font-size:12pt;">
      No orders found for the selected period${filterLabel ? ' in ' + filterLabel : ''}.
    </p>
  ` : `
    <table>
      <thead>
        <tr>
          <th style="width:60px;">Code</th>
          <th>Product</th>
          <th style="width:80px; text-align:right;">Qty</th>
          <th style="width:120px;">Source</th>
          <th style="width:50px; text-align:center;">Done</th>
        </tr>
      </thead>
      <tbody>
        ${products.map((p: any) => `
          <tr>
            <td style="font-family:monospace; font-weight:bold; font-size:8pt;">
              ${p.code}
            </td>
            <td style="font-size:9pt;">
              <strong>${p.product_name}</strong>
            </td>
            <td style="text-align:right; font-size:13pt; font-weight:bold; white-space:nowrap;">
              ${p.quantity}
              <span style="font-size:8pt; font-weight:normal;"> ${p.unit}</span>
            </td>
            <td style="font-size:8pt; line-height:1.4;">
              ${p.sources.manual > 0
                ? `M:${p.sources.manual} ` : ''}
              ${p.sources.standing_order_confirmed > 0
                ? `S:${p.sources.standing_order_confirmed} ` : ''}
              ${p.sources.standing_order_projected > 0
                ? `P:${p.sources.standing_order_projected} ` : ''}
              ${p.sources.online > 0
                ? `O:${p.sources.online}` : ''}
            </td>
            <td style="text-align:center;">
              <input type="checkbox" style="width:14px;height:14px;">
            </td>
          </tr>
        `).join('')}
        <tr class="total-row">
          <td colspan="2" style="text-align:right; font-size:10pt; padding:5px 8px;">
            GRAND TOTAL:
          </td>
          <td style="text-align:right; font-size:14pt; font-weight:bold; padding:5px 8px;">
            ${grandTotal}
          </td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top:14px; border-top:1px solid #ccc; padding-top:8px;">
      <p style="font-weight:bold; margin-bottom:6px; font-size:9pt;">Notes:</p>
      <div style="border:1px solid #ccc; min-height:50px; padding:8px;
                  background:#f9f9f9;"></div>
    </div>
  `}

  <div class="signoff">
    <div>
      <p>Prepared by: _______________________</p>
      <p>Date: _______________________</p>
    </div>
    <div>
      <p>Checked by: _______________________</p>
      <p>Date: _______________________</p>
    </div>
  </div>

  <script>
    ${autoPrint ? `
      window.addEventListener('load', function() {
        setTimeout(function() { window.print(); }, 800);
      });
    ` : ''}

    // Track active min/max (initialised from server-rendered values)
    var activeMin = ${minCode};
    var activeMax = ${maxCode};

    function getBrisbaneISO(offsetDays) {
      const now      = new Date();
      const brisbane = new Date(now.getTime() + 10 * 60 * 60 * 1000);
      brisbane.setUTCDate(brisbane.getUTCDate() + (offsetDays || 0));
      return brisbane.toISOString().split('T')[0];
    }

    function getDatesBetween(start, end) {
      const dates   = [];
      const current = new Date(start + 'T12:00:00Z');
      const last    = new Date(end   + 'T12:00:00Z');
      while (current <= last) {
        dates.push(current.toISOString().split('T')[0]);
        current.setUTCDate(current.getUTCDate() + 1);
      }
      return dates.length ? dates : [start];
    }

    function setPreset(startOffset, endOffset) {
      document.getElementById('startDate').value = getBrisbaneISO(startOffset);
      document.getElementById('endDate').value   = getBrisbaneISO(endOffset);
    }

    function setCategory(min, max) {
      activeMin = min;
      activeMax = max;
      document.getElementById('minCode').value = (min === 0)     ? '' : min;
      document.getElementById('maxCode').value = (max === 99999) ? '' : max;
      // Update button highlights
      document.querySelectorAll('.cat-btn').forEach(function(btn) {
        btn.classList.remove('cat-active');
      });
      event.target.classList.add('cat-active');
    }

    function loadRange(print) {
      const start  = document.getElementById('startDate').value;
      const end    = document.getElementById('endDate').value;
      const minVal = document.getElementById('minCode').value.trim();
      const maxVal = document.getElementById('maxCode').value.trim();

      if (!start || !end) { alert('Please select both dates.'); return; }
      if (start > end)    { alert('Start must be before end.'); return; }

      const dates = getDatesBetween(start, end);
      if (dates.length > 14) {
        if (!confirm(dates.length + ' days selected. Continue?')) return;
      }

      const params = new URLSearchParams({ dates: dates.join(',') });
      if (minVal) params.set('min', minVal);
      if (maxVal) params.set('max', maxVal);
      if (print)  params.set('autoprint', '1');

      window.location.href = '/admin/production/print?' + params.toString();
    }

    document.getElementById('startDate').addEventListener('change', function() {
      const end = document.getElementById('endDate');
      if (this.value > end.value) end.value = this.value;
    });

    // Typing a custom range clears the category highlight
    ['minCode','maxCode'].forEach(function(id) {
      document.getElementById(id).addEventListener('input', function() {
        document.querySelectorAll('.cat-btn').forEach(function(btn) {
          btn.classList.remove('cat-active');
        });
      });
    });

    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        window.print();
      }
    });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
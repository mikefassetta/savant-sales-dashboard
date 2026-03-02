let salesData = JSON.parse(localStorage.getItem('salesData')) || [];
let salesGoal = parseFloat(localStorage.getItem('salesGoal')) || 1000000;
let targetYear = parseInt(localStorage.getItem('targetYear'), 10) || new Date().getFullYear();
let dailyChart = null;
let trackingChart = null;
let reportModalState = null;
const KPI_ORDER_STORAGE_KEY = 'salesDashboardKpiOrderV2';
let draggingKpiKey = null;

const DOM = {
    salesDate: document.getElementById('salesDate'),
    targetYear: document.getElementById('targetYear'),
    fileInput: document.getElementById('dataFile'),
    dropZone: document.getElementById('dropZone'),
    uploadStatus: document.getElementById('uploadStatus'),
    statsGrid: document.getElementById('statsGrid')
};

DOM.salesDate.valueAsDate = new Date();

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('salesGoal').value = salesGoal;
    DOM.targetYear.value = targetYear;
    setupKpiDragAndDrop();
    setupFileUpload();

    var hasLocalData = salesData.length > 0;
    if (!hasLocalData) {
        loadSharedData().then(function() {
            updateDashboard();
        });
    } else {
        updateDashboard();
    }
});

function setupKpiDragAndDrop() {
    if (!DOM.statsGrid) {
        return;
    }

    applySavedKpiOrder();

    const cards = Array.from(DOM.statsGrid.querySelectorAll('.kpi-card'));
    cards.forEach(function(card) {
        card.addEventListener('dragstart', function(event) {
            draggingKpiKey = card.dataset.kpi || null;
            card.classList.add('dragging');
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', draggingKpiKey || '');
            }
        });

        card.addEventListener('dragend', function() {
            card.classList.remove('dragging');
            draggingKpiKey = null;
            saveKpiOrder();
        });
    });

    DOM.statsGrid.addEventListener('dragover', function(event) {
        if (!draggingKpiKey) {
            return;
        }
        event.preventDefault();

        const dragged = DOM.statsGrid.querySelector('.kpi-card.dragging');
        if (!dragged) {
            return;
        }

        const afterElement = getKpiInsertAfterElement(event.clientX, event.clientY);
        if (!afterElement) {
            DOM.statsGrid.appendChild(dragged);
        } else if (afterElement !== dragged) {
            DOM.statsGrid.insertBefore(dragged, afterElement);
        }
    });

    DOM.statsGrid.addEventListener('drop', function(event) {
        if (!draggingKpiKey) {
            return;
        }
        event.preventDefault();
        saveKpiOrder();
    });
}

function applySavedKpiOrder() {
    const raw = localStorage.getItem(KPI_ORDER_STORAGE_KEY);
    if (!raw) {
        return;
    }

    let savedOrder;
    try {
        savedOrder = JSON.parse(raw);
    } catch (err) {
        return;
    }

    if (!Array.isArray(savedOrder) || savedOrder.length === 0) {
        return;
    }

    const cardMap = new Map();
    Array.from(DOM.statsGrid.querySelectorAll('.kpi-card')).forEach(function(card) {
        cardMap.set(card.dataset.kpi, card);
    });

    savedOrder.forEach(function(key) {
        const card = cardMap.get(key);
        if (card) {
            DOM.statsGrid.appendChild(card);
        }
    });
}

function saveKpiOrder() {
    if (!DOM.statsGrid) {
        return;
    }
    const order = Array.from(DOM.statsGrid.querySelectorAll('.kpi-card'))
        .map(function(card) {
            return card.dataset.kpi;
        });
    localStorage.setItem(KPI_ORDER_STORAGE_KEY, JSON.stringify(order));
}

function getKpiInsertAfterElement(clientX, clientY) {
    if (!DOM.statsGrid) {
        return null;
    }

    const candidates = Array.from(DOM.statsGrid.querySelectorAll('.kpi-card:not(.dragging)'));
    let closest = { distance: Number.POSITIVE_INFINITY, element: null };

    candidates.forEach(function(card) {
        const rect = card.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = centerX - clientX;
        const dy = centerY - clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < closest.distance) {
            closest = { distance: distance, element: card };
        }
    });

    if (!closest.element) {
        return null;
    }

    const rect = closest.element.getBoundingClientRect();
    const isBefore = clientY < rect.top + rect.height / 2;
    return isBefore ? closest.element : closest.element.nextSibling;
}

function setupFileUpload() {
    DOM.dropZone.addEventListener('click', function() {
        DOM.fileInput.click();
    });

    DOM.fileInput.addEventListener('change', function(e) {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
            setUploadStatus('Uploading ' + files.length + ' file(s)...');
            processFiles(files);
        }
    });

    DOM.dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        DOM.dropZone.classList.add('dragover');
    });

    DOM.dropZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        DOM.dropZone.classList.remove('dragover');
    });

    DOM.dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        DOM.dropZone.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length > 0) {
            setUploadStatus('Uploading ' + files.length + ' file(s)...');
            processFiles(files);
        }
    });

    document.body.addEventListener('dragover', function(e) {
        e.preventDefault();
    });

    document.body.addEventListener('drop', function(e) {
        e.preventDefault();
    });
}

function setUploadStatus(message, type) {
    if (!DOM.uploadStatus) {
        return;
    }

    DOM.uploadStatus.textContent = message || '';
    DOM.uploadStatus.classList.remove('success', 'error');
    if (type === 'success') {
        DOM.uploadStatus.classList.add('success');
    } else if (type === 'error') {
        DOM.uploadStatus.classList.add('error');
    }
}

function updateGoal() {
    const goalInput = document.getElementById('salesGoal');
    salesGoal = parseFloat(goalInput.value) || 0;
    targetYear = parseInt(DOM.targetYear.value, 10) || new Date().getFullYear();

    localStorage.setItem('salesGoal', salesGoal);
    localStorage.setItem('targetYear', targetYear);
    updateDashboard();
}

function addSales() {
    const date = DOM.salesDate.value;
    const amount = parseFloat(document.getElementById('dailySales').value);

    if (!date || !amount || amount <= 0) {
        alert('Please enter a valid date and sales amount');
        return;
    }

    upsertEntry(date, amount);

    localStorage.setItem('salesData', JSON.stringify(salesData));
    document.getElementById('dailySales').value = '';
    DOM.salesDate.valueAsDate = new Date();

    updateDashboard();
}

function deleteSales(index) {
    if (confirm('Are you sure you want to delete this entry?')) {
        salesData.splice(index, 1);
        localStorage.setItem('salesData', JSON.stringify(salesData));
        updateDashboard();
    }
}

function processFiles(files) {
    let processed = 0;
    let importedCount = 0;
    const errors = [];

    files.forEach(function(file) {
        const lowerName = file.name.toLowerCase();

        if (lowerName.endsWith('.csv')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    importedCount += importCSVText(String(e.target.result || ''), file.name);
                } catch (err) {
                    errors.push(file.name + ': ' + err.message);
                }
                done();
            };
            reader.onerror = function() {
                errors.push(file.name + ': Could not read file');
                done();
            };
            reader.readAsText(file);
            return;
        }

        if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const bytes = new Uint8Array(e.target.result);
                    importedCount += importExcelWorkbook(bytes, file.name);
                } catch (err) {
                    errors.push(file.name + ': ' + err.message);
                }
                done();
            };
            reader.onerror = function() {
                errors.push(file.name + ': Could not read file');
                done();
            };
            reader.readAsArrayBuffer(file);
            return;
        }

        errors.push(file.name + ': Unsupported file type');
        done();
    });

    function done() {
        processed += 1;
        if (processed !== files.length) {
            return;
        }

        salesData.sort(function(a, b) {
            return new Date(a.date) - new Date(b.date);
        });
        localStorage.setItem('salesData', JSON.stringify(salesData));
        DOM.fileInput.value = '';
        updateDashboard();

        let message = 'Processed ' + files.length + ' file(s). Imported/updated ' + importedCount + ' day(s).';
        if (errors.length > 0) {
            message += ' Issues: ' + errors.join(' | ');
            setUploadStatus(message, 'error');
            return;
        }
        setUploadStatus(message, 'success');
    }
}

function importCSVText(text, fileName) {
    let imported = 0;
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
            continue;
        }

        if (i === 0 && /date|amount|sales|revenue/i.test(line)) {
            continue;
        }

        const parts = line.split(',');
        if (parts.length < 2) {
            continue;
        }

        const date = parseDate(parts[0].trim());
        const amount = parseMoney(parts[1]);

        if (!date || !Number.isFinite(amount) || amount <= 0) {
            continue;
        }

        upsertEntry(date, amount);
        imported += 1;
    }

    if (imported === 0) {
        throw new Error('No valid rows found');
    }

    return imported;
}

function importExcelWorkbook(bytes, fileName) {
    const workbook = XLSX.read(bytes, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const savantImported = tryImportSavantReport(sheet);
    if (savantImported) {
        return savantImported;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
    let imported = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!Array.isArray(row) || row.length < 2) {
            continue;
        }

        if (
            i === 0 &&
            row.some(function(cell) {
                return typeof cell === 'string' && /date|amount|sales|revenue/i.test(cell);
            })
        ) {
            continue;
        }

        const date = normalizeDateFromCell(row[0]);
        const amount = parseMoney(row[1]);

        if (!date || !Number.isFinite(amount) || amount <= 0) {
            continue;
        }

        upsertEntry(date, amount);
        imported += 1;
    }

    if (imported === 0) {
        throw new Error('No valid date/amount rows found');
    }

    return imported;
}

function tryImportSavantReport(sheet) {
    const cellB1 = sheet.B1;
    const cellB2 = sheet.B2;

    if (!cellB1 || !cellB2) {
        return 0;
    }

    const date = normalizeDateFromCell(cellB1.v);
    const amount = parseMoney(cellB2.v);

    if (!date || !Number.isFinite(amount) || amount <= 0) {
        return 0;
    }

    const orders = extractSavantOrders(sheet);
    upsertEntry(date, amount, orders);
    return 1;
}

function extractSavantOrders(sheet) {
    const orders = [];
    let row = 5;

    while (true) {
        const accountCell = sheet['A' + row];
        const orderCell = sheet['E' + row];
        if ((!accountCell || !accountCell.v) && (!orderCell || !orderCell.v)) {
            break;
        }

        const getCellValue = function(col) {
            const cell = sheet[col + row];
            return cell && cell.v !== undefined ? String(cell.v) : '';
        };

        const getMoneyValue = function(col) {
            const cell = sheet[col + row];
            if (!cell || cell.v === undefined) {
                return 0;
            }
            const amount = parseMoney(cell.v);
            return Number.isFinite(amount) ? amount : 0;
        };

        orders.push({
            accountRep: getCellValue('A'),
            billDate: getCellValue('B'),
            accountName: getCellValue('C'),
            customerPO: getCellValue('D'),
            orderNumber: getCellValue('E'),
            orderType: getCellValue('F'),
            source: getCellValue('G'),
            orderSubtotal: getMoneyValue('H'),
            product: getCellValue('I'),
            quantity: getCellValue('J'),
            lineTotal: getMoneyValue('K')
        });

        row += 1;
    }

    return orders;
}

function upsertEntry(date, amount, orders) {
    const existingIndex = salesData.findIndex(function(entry) {
        return entry.date === date;
    });

    if (existingIndex !== -1) {
        salesData[existingIndex].amount = amount;
        if (Array.isArray(orders)) {
            salesData[existingIndex].orders = orders;
        }
    } else {
        const entry = { date: date, amount: amount };
        if (Array.isArray(orders)) {
            entry.orders = orders;
        }
        salesData.push(entry);
    }
}

function parseMoney(value) {
    if (typeof value === 'number') {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = parseFloat(value.replace(/[$,\s]/g, ''));
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    return NaN;
}

function normalizeDateFromCell(value) {
    if (typeof value === 'number') {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (!parsed) {
            return null;
        }
        return [
            String(parsed.y),
            String(parsed.m).padStart(2, '0'),
            String(parsed.d).padStart(2, '0')
        ].join('-');
    }

    if (typeof value === 'string') {
        return parseDate(value.trim());
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    return null;
}

function parseDate(dateStr) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }

    const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
        const month = slashMatch[1].padStart(2, '0');
        const day = slashMatch[2].padStart(2, '0');
        return slashMatch[3] + '-' + month + '-' + day;
    }

    const dashMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dashMatch) {
        const month = dashMatch[1].padStart(2, '0');
        const day = dashMatch[2].padStart(2, '0');
        return dashMatch[3] + '-' + month + '-' + day;
    }

    const parsed = new Date(dateStr);
    if (!Number.isNaN(parsed.getTime())) {
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    return null;
}

function uploadFile() {
    const files = Array.from(DOM.fileInput.files || []);
    if (files.length === 0) {
        alert('Please choose one or more files');
        return;
    }
    processFiles(files);
}

function createSnapshot() {
    const container = document.getElementById('snapshotSection');
    if (!container) {
        return;
    }

    const snapshotBtn = Array.from(document.querySelectorAll('button')).find(function(btn) {
        return (btn.textContent || '').trim() === 'Create Snapshot';
    });

    if (snapshotBtn) {
        snapshotBtn.disabled = true;
        snapshotBtn.textContent = 'Creating...';
    }

    html2canvas(container, {
        backgroundColor: '#F5F0EA',
        scale: 2,
        useCORS: true,
        logging: false
    }).then(function(canvas) {
        const link = document.createElement('a');
        const datePart = new Date().toISOString().slice(0, 10);
        link.download = 'sales-dashboard-top-snapshot-' + datePart + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    }).catch(function(error) {
        alert('Could not create snapshot: ' + error.message);
    }).finally(function() {
        if (snapshotBtn) {
            snapshotBtn.disabled = false;
            snapshotBtn.textContent = 'Create Snapshot';
        }
    });
}

// ── Admin panel ────────────────────────────────────────────────
var ADMIN_PASSWORD = 'savant2026';   // ← change this to whatever you want
var adminUnlocked = false;

function toggleAdminPanel() {
    if (adminUnlocked) {
        lockAdminPanel();
        return;
    }
    var pwd = prompt('Enter admin password:');
    if (pwd === null) return;        // cancelled
    if (pwd === ADMIN_PASSWORD) {
        adminUnlocked = true;
        var panel = document.getElementById('adminPanel');
        var btn   = document.getElementById('adminLockBtn');
        panel.classList.add('open');
        btn.textContent = '🔓 Admin';
        btn.classList.add('unlocked');
    } else {
        alert('Incorrect password.');
    }
}

function lockAdminPanel() {
    adminUnlocked = false;
    var panel = document.getElementById('adminPanel');
    var btn   = document.getElementById('adminLockBtn');
    panel.classList.remove('open');
    btn.textContent = '🔒 Admin';
    btn.classList.remove('unlocked');
}
// ───────────────────────────────────────────────────────────────

function exportData(format = 'csv') {
    if (salesData.length === 0) {
        alert('No data to export');
        return;
    }

    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'csv') {
        let csv = 'Date,Amount\n';
        salesData.forEach(function(entry) {
            csv += entry.date + ',' + entry.amount + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sales_data_' + timestamp + '.csv';
        a.click();
        window.URL.revokeObjectURL(url);
        return;
    }

    const wsData = [['Date', 'Amount', 'Cumulative']];
    let cumulative = 0;
    salesData.forEach(function(entry) {
        cumulative += entry.amount;
        wsData.push([entry.date, entry.amount, cumulative]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Data');
    XLSX.writeFile(wb, 'sales_data_' + timestamp + '.xlsx');
}

function loadSharedData() {
    return fetch('shared-data.json')
        .then(function(response) {
            if (!response.ok) {
                throw new Error('No shared data file');
            }
            return response.json();
        })
        .then(function(data) {
            if (Array.isArray(data.salesData) && data.salesData.length > 0) {
                salesData = data.salesData;
                localStorage.setItem('salesData', JSON.stringify(salesData));
            }
            if (data.salesGoal !== undefined) {
                salesGoal = parseFloat(data.salesGoal) || 1000000;
                localStorage.setItem('salesGoal', salesGoal);
                document.getElementById('salesGoal').value = salesGoal;
            }
            if (data.targetYear !== undefined) {
                targetYear = parseInt(data.targetYear, 10) || new Date().getFullYear();
                localStorage.setItem('targetYear', targetYear);
                DOM.targetYear.value = targetYear;
            }
        })
        .catch(function() {
            // No shared data file — that's fine, use empty state
        });
}

function publishSharedData() {
    if (salesData.length === 0) {
        alert('No data to publish');
        return;
    }

    var payload = {
        salesData: salesData,
        salesGoal: salesGoal,
        targetYear: targetYear,
        publishedAt: new Date().toISOString()
    };

    var json = JSON.stringify(payload, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = window.URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'shared-data.json';
    a.click();
    window.URL.revokeObjectURL(url);

    alert('shared-data.json downloaded to your Downloads folder!\n\n1. Move it to:\n   Documents > Code projects > Savant dashboard\n\n2. Then in Terminal run:\n   git add shared-data.json && git commit -m "Update sales data" && git push');
}

function clearAllData() {
    if (confirm('Are you sure you want to clear all sales data? This cannot be undone.')) {
        salesData = [];
        localStorage.setItem('salesData', JSON.stringify(salesData));
        updateDashboard();
    }
}

function updateDashboard() {
    const yearData = salesData
        .filter(function(entry) {
            return new Date(entry.date).getFullYear() === targetYear;
        })
        .sort(function(a, b) {
            return new Date(a.date) - new Date(b.date);
        });

    const range = getYearRange(targetYear);
    const dailySeries = buildDailySeries(yearData, range.rangeStart, range.rangeEnd);

    const totalSales = yearData.reduce(function(sum, entry) {
        return sum + entry.amount;
    }, 0);

    const remaining = Math.max(0, salesGoal - totalSales);
    const progress = salesGoal > 0 ? Math.min(100, (totalSales / salesGoal) * 100) : 0;

    const totalDays = range.totalDays;
    const elapsedDays = range.elapsedDays;
    const remainingDays = Math.max(0, totalDays - elapsedDays);
    const requiredDaily = remainingDays > 0 ? remaining / remainingDays : remaining;
    const currentDailyPace = elapsedDays > 0 ? totalSales / elapsedDays : 0;

    const expectedToDate = salesGoal > 0 ? (salesGoal / totalDays) * elapsedDays : 0;
    const gap = totalSales - expectedToDate;
    const paceStatus = salesGoal <= 0 ? '--' : gap >= 0 ? 'Ahead' : 'Behind';
    const asOfEl = document.getElementById('dataAsOf');
    const nonZeroEntries = yearData.filter(function(entry) {
        return entry.amount > 0;
    });
    const latestEntry = nonZeroEntries.length ? nonZeroEntries[nonZeroEntries.length - 1] : (yearData.length ? yearData[yearData.length - 1] : null);
    if (asOfEl) {
        asOfEl.textContent = latestEntry
            ? 'Data current through ' + formatDate(latestEntry.date)
            : 'Data current through --';
    }


    document.getElementById('totalSales').textContent = formatCurrency(totalSales);
    document.getElementById('goalDisplay').textContent = formatCurrency(salesGoal);
    document.getElementById('progressPercent').textContent = progress.toFixed(1) + '%';
    document.getElementById('remaining').textContent = formatCurrency(remaining);
    document.getElementById('requiredDaily').textContent = formatCurrency(requiredDaily);
    document.getElementById('currentDailyPace').textContent = formatCurrency(currentDailyPace);
    document.getElementById('expectedYtd').textContent = formatCurrency(expectedToDate);
    document.getElementById('paceStatus').textContent = paceStatus;

    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = progress + '%';
    document.getElementById('progressText').textContent = progress.toFixed(1) + '%';

    updateTrendAnalysis(dailySeries, totalSales, totalDays, expectedToDate);
    updateLeaderboard(yearData);
    updateChart(dailySeries);
    updateTable(dailySeries);
}

function updateTrendAnalysis(dailySeries, totalSales, totalDays, expectedToDate) {
    if (dailySeries.length === 0) {
        document.getElementById('dailyAvg').textContent = '$0';
        document.getElementById('projected').textContent = '$0';
        document.getElementById('daysTracked').textContent = '0';
        document.getElementById('paceGap').textContent = '$0';
        return;
    }

    const dailyAvg = totalSales / dailySeries.length;
    document.getElementById('dailyAvg').textContent = formatCurrency(dailyAvg);
    document.getElementById('projected').textContent = formatCurrency(dailyAvg * totalDays) + ' (year)';
    document.getElementById('daysTracked').textContent = String(dailySeries.length);
    const paceGap = totalSales - expectedToDate;
    const paceGapEl = document.getElementById('paceGap');
    const absGap = formatCurrency(Math.abs(paceGap));
    paceGapEl.textContent = paceGap >= 0 ? '+' + absGap : '-' + absGap;
    paceGapEl.style.color = paceGap >= 0 ? '#2D7A4F' : '#B84233';
}

function updateChart(dailySeries) {
    const dailyCtx = document.getElementById('dailySalesChart').getContext('2d');
    const trackingCtx = document.getElementById('trackingChart').getContext('2d');

    let cumulative = 0;
    const cumulativeData = dailySeries.map(function(entry) {
        cumulative += entry.amount;
        return cumulative;
    });

    const yearStart = new Date(targetYear, 0, 1);
    const yearEnd = new Date(targetYear, 11, 31);
    const totalDays = Math.floor((yearEnd - yearStart) / 86400000) + 1;
    const dailyGoalPace = salesGoal > 0 ? salesGoal / totalDays : 0;
    const ytdTargetLine = dailySeries.map(function(entry) {
        const entryDate = new Date(entry.date + 'T00:00:00');
        const dayOfYear = Math.floor((entryDate - yearStart) / 86400000) + 1;
        return Math.min(salesGoal, dailyGoalPace * dayOfYear);
    });

    const labels = dailySeries.map(function(entry) {
        return entry.date;
    });

    const amounts = dailySeries.map(function(entry) {
        return entry.amount;
    });

    if (dailyChart) {
        dailyChart.destroy();
    }
    if (trackingChart) {
        trackingChart.destroy();
    }

    dailyChart = new Chart(dailyCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Daily Sales',
                    type: 'bar',
                    data: amounts,
                    borderColor: '#C4633F',
                    backgroundColor: 'rgba(217, 119, 87, 0.3)',
                    borderWidth: 1,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                title: {
                    display: true,
                    text: 'Daily Sales (' + targetYear + ')',
                    font: {
                        size: 16
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Daily Sales ($)'
                    }
                }
            }
        }
    });

    trackingChart = new Chart(trackingCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Cumulative Sales',
                    type: 'line',
                    data: cumulativeData,
                    borderColor: '#D97757',
                    backgroundColor: 'rgba(217, 119, 87, 0.12)',
                    tension: 0.35,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'YTD Target',
                    type: 'line',
                    data: ytdTargetLine,
                    borderColor: '#8C8278',
                    borderDash: [8, 5],
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                title: {
                    display: true,
                    text: 'Cumulative vs Pace (' + targetYear + ')',
                    font: {
                        size: 16
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Cumulative Sales ($)'
                    }
                }
            }
        }
    });
}

function updateLeaderboard(yearData) {
    const el = document.getElementById('leaderboardList');
    const yearEl = document.getElementById('leaderboardYear');
    if (!el) return;

    if (yearEl) yearEl.textContent = targetYear;

    // Aggregate lineTotal by accountName across all orders
    const dealerMap = {};
    yearData.forEach(function(entry) {
        if (!Array.isArray(entry.orders)) return;
        entry.orders.forEach(function(order) {
            const name = (order.accountName || '').trim();
            if (!name) return;
            dealerMap[name] = (dealerMap[name] || 0) + (order.lineTotal || 0);
        });
    });

    const dealers = Object.keys(dealerMap).map(function(name) {
        return { name: name, revenue: dealerMap[name] };
    }).sort(function(a, b) { return b.revenue - a.revenue; });

    if (dealers.length === 0) {
        el.innerHTML = '<p class="no-data">No dealer data yet.</p>';
        return;
    }

    const top10 = dealers.slice(0, 10);
    const grandTotal = dealers.reduce(function(sum, d) { return sum + d.revenue; }, 0);
    const maxRevenue = top10[0].revenue;

    let html = '';
    top10.forEach(function(dealer, idx) {
        const pct = grandTotal > 0 ? (dealer.revenue / grandTotal * 100) : 0;
        const barWidth = maxRevenue > 0 ? (dealer.revenue / maxRevenue * 100) : 0;
        const rank = idx + 1;
        const medalClass = rank === 1 ? ' rank-gold' : rank === 2 ? ' rank-silver' : rank === 3 ? ' rank-bronze' : '';

        html +=
            '<div class="lb-row">' +
                '<div class="lb-rank' + medalClass + '">' + rank + '</div>' +
                '<div class="lb-info">' +
                    '<div class="lb-name-row">' +
                        '<button class="lb-name dealer-link" data-dealer="' + escapeAttr(dealer.name) + '" onclick="showDealerDetails(this.dataset.dealer)">' + escapeHtml(dealer.name) + '</button>' +
                        '<span class="lb-pct">' + pct.toFixed(1) + '%</span>' +
                        '<span class="lb-revenue">' + formatCurrency(dealer.revenue) + '</span>' +
                    '</div>' +
                    '<div class="lb-bar-track"><div class="lb-bar" style="width:' + barWidth.toFixed(1) + '%"></div></div>' +
                '</div>' +
            '</div>';
    });

    el.innerHTML = html;
}

function updateTable(dailySeries) {
    const tableBody = document.getElementById('salesTableBody');

    if (dailySeries.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="no-data">No sales data yet for this year. Add entries or upload reports.</td></tr>';
        return;
    }

    const now = new Date();
    const currentMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    // Group entries by month (newest first)
    const monthMap = {};
    const monthOrder = [];

    for (let i = dailySeries.length - 1; i >= 0; i--) {
        const entry = dailySeries[i];
        const d = new Date(entry.date + 'T12:00:00');
        const monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

        if (!monthMap[monthKey]) {
            monthMap[monthKey] = { entries: [], date: d };
            monthOrder.push(monthKey);
        }
        monthMap[monthKey].entries.push({ entry: entry, seriesIndex: i });
    }

    let html = '';

    monthOrder.forEach(function(monthKey) {
        const monthData = monthMap[monthKey];
        const isCurrentMonth = monthKey === currentMonthKey;
        const isCollapsed = !isCurrentMonth;

        const monthTotal = monthData.entries.reduce(function(sum, item) { return sum + item.entry.amount; }, 0);
        const daysWithSales = monthData.entries.filter(function(item) { return item.entry.amount > 0; }).length;
        const dailyAvg = daysWithSales > 0 ? monthTotal / daysWithSales : 0;
        const weeklyAvg = dailyAvg * 5;

        const monthLabel = monthData.date.toLocaleString('default', { month: 'long', year: 'numeric' });
        const icon = isCollapsed ? '&#9654;' : '&#9660;';
        const rowCount = monthData.entries.length;

        html += '<tr class="month-header' + (isCollapsed ? ' collapsed' : '') + '" data-month="' + monthKey + '" onclick="toggleMonth(\'' + monthKey + '\')">' +
            '<td><span class="month-toggle">' + icon + '</span> ' + monthLabel + ' <span class="month-day-count">(' + rowCount + ' day' + (rowCount !== 1 ? 's' : '') + ')</span></td>' +
            '<td class="month-total">' + formatCurrency(monthTotal) + '</td>' +
            '<td><span class="month-stat">Day avg: ' + formatCurrency(dailyAvg) + '</span><span class="month-stat">Wk avg: ' + formatCurrency(weeklyAvg) + '</span></td>' +
            '<td></td>' +
            '<td></td>' +
            '</tr>';

        monthData.entries.forEach(function(item) {
            const entry = item.entry;
            const i = item.seriesIndex;
            const sourceEntry = salesData.find(function(row) { return row.date === entry.date; });
            const originalIndex = sourceEntry ? salesData.findIndex(function(row) { return row.date === entry.date; }) : -1;

            const cumulativeUpToHere = dailySeries.slice(0, i + 1).reduce(function(sum, row) { return sum + row.amount; }, 0);

            const actionCell = originalIndex !== -1
                ? '<button class="delete-btn" onclick="deleteSales(' + originalIndex + ')">Delete</button>'
                : '<span class="no-data">--</span>';
            const detailsCell = sourceEntry && Array.isArray(sourceEntry.orders) && sourceEntry.orders.length > 0
                ? '<button class="details-btn" data-date="' + entry.date + '" onclick="showReportDetails(this.dataset.date)">View</button>'
                : '<span class="no-data">--</span>';

            html += '<tr class="month-row" data-month="' + monthKey + '"' + (isCollapsed ? ' style="display:none"' : '') + '>' +
                '<td class="day-row-date">' + formatDate(entry.date) + '</td>' +
                '<td>' + formatCurrency(entry.amount) + '</td>' +
                '<td>' + formatCurrency(cumulativeUpToHere) + '</td>' +
                '<td>' + actionCell + '</td>' +
                '<td>' + detailsCell + '</td>' +
                '</tr>';
        });
    });

    tableBody.innerHTML = html;
}

function toggleMonth(monthKey) {
    const header = document.querySelector('.month-header[data-month="' + monthKey + '"]');
    const rows = document.querySelectorAll('.month-row[data-month="' + monthKey + '"]');
    const isCollapsed = header.classList.contains('collapsed');
    const toggle = header.querySelector('.month-toggle');

    if (isCollapsed) {
        header.classList.remove('collapsed');
        toggle.innerHTML = '&#9660;';
        rows.forEach(function(r) { r.style.display = ''; });
    } else {
        header.classList.add('collapsed');
        toggle.innerHTML = '&#9654;';
        rows.forEach(function(r) { r.style.display = 'none'; });
    }
}

function showReportDetails(dateStr) {
    const dayData = salesData.find(function(row) {
        return row.date === dateStr;
    });

    if (!dayData || !Array.isArray(dayData.orders) || dayData.orders.length === 0) {
        return;
    }

    const modal = document.getElementById('reportModal');
    const title = document.getElementById('reportModalTitle');
    const body = document.getElementById('reportModalBody');
    const formattedDate = formatDate(dateStr);

    title.textContent = 'Transactions for ' + formattedDate;
    reportModalState = {
        date: dateStr,
        orders: dayData.orders.slice(),
        selectedDealer: null,
        sortColumn: null,
        sortDirection: 'asc'
    };
    renderReportModalTable();

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function showDealerDetails(dealerName) {
    var orders = getDealerYtdOrders(dealerName);
    if (orders.length === 0) {
        alert('No order detail available for ' + dealerName + ' in ' + targetYear + '.');
        return;
    }

    var modal = document.getElementById('reportModal');
    var title = document.getElementById('reportModalTitle');
    title.textContent = 'YTD Transactions — ' + dealerName + ' (' + targetYear + ')';

    reportModalState = {
        date: null,
        orders: orders,
        selectedDealer: dealerName,
        sortColumn: null,
        sortDirection: 'asc',
        fromLeaderboard: true
    };
    renderReportModalTable();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function closeReportModal() {
    const modal = document.getElementById('reportModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    reportModalState = null;
}

document.addEventListener('click', function(event) {
    const modal = document.getElementById('reportModal');
    if (!modal || !modal.classList.contains('open')) {
        return;
    }
    if (event.target === modal) {
        closeReportModal();
    }
});

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

var MODAL_COLUMNS = [
    { key: 'reportDate', label: 'Date', type: 'date' },
    { key: 'accountName', label: 'Dealer', type: 'string' },
    { key: 'customerPO', label: 'PO', type: 'string' },
    { key: 'orderNumber', label: 'Order #', type: 'string' },
    { key: 'product', label: 'Product', type: 'string' },
    { key: 'quantity', label: 'Qty', type: 'number' },
    { key: 'lineTotal', label: 'Line Total', type: 'number' }
];

function sortModalColumn(key) {
    if (!reportModalState) {
        return;
    }
    if (reportModalState.sortColumn === key) {
        reportModalState.sortDirection = reportModalState.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        reportModalState.sortColumn = key;
        reportModalState.sortDirection = 'asc';
    }
    renderReportModalTable();
}

function sortOrders(orders, column, direction) {
    if (!column) {
        return orders;
    }
    var col = MODAL_COLUMNS.find(function(c) { return c.key === column; });
    if (!col) {
        return orders;
    }
    var sorted = orders.slice();
    var dir = direction === 'desc' ? -1 : 1;
    sorted.sort(function(a, b) {
        var va = a[column];
        var vb = b[column];
        if (col.type === 'number') {
            return dir * ((parseFloat(va) || 0) - (parseFloat(vb) || 0));
        }
        if (col.type === 'date') {
            return dir * (new Date(va || '1970-01-01') - new Date(vb || '1970-01-01'));
        }
        return dir * String(va || '').localeCompare(String(vb || ''));
    });
    return sorted;
}

function getAllDealerNames() {
    var dealers = new Set();
    salesData.forEach(function(entry) {
        if (new Date(entry.date).getFullYear() !== targetYear) {
            return;
        }
        if (!Array.isArray(entry.orders)) {
            return;
        }
        entry.orders.forEach(function(order) {
            var name = order.accountName;
            if (name && name !== '--') {
                dealers.add(name);
            }
        });
    });
    var arr = Array.from(dealers);
    arr.sort(function(a, b) { return a.localeCompare(b); });
    return arr;
}

function renderReportModalTable() {
    if (!reportModalState) {
        return;
    }

    const body = document.getElementById('reportModalBody');
    const title = document.getElementById('reportModalTitle');
    const selectedDealer = reportModalState.selectedDealer;
    const baseOrders = reportModalState.orders.map(function(order) {
        return Object.assign({ reportDate: reportModalState.date }, order);
    });
    var visibleOrders = selectedDealer ? getDealerYtdOrders(selectedDealer) : baseOrders;
    visibleOrders = sortOrders(visibleOrders, reportModalState.sortColumn, reportModalState.sortDirection);
    const formattedDate = formatDate(reportModalState.date);

    const filteredTotal = visibleOrders.reduce(function(sum, order) {
        return sum + (order.lineTotal || 0);
    }, 0);

    if (selectedDealer) {
        title.textContent = 'YTD Transactions for ' + selectedDealer + ' (' + targetYear + ')';
    } else {
        title.textContent = 'Transactions for ' + formattedDate;
    }

    let html = '<div class=\"modal-meta\"><strong>Total:</strong> ' + formatCurrency(filteredTotal) +
        ' | <strong>Line Items:</strong> ' + visibleOrders.length + '</div>';

    if (selectedDealer) {
        var allDealers = getAllDealerNames();
        html += '<div class=\"modal-filter\"><label class=\"dealer-select-label\">Dealer:</label>' +
            '<select id=\"dealerSwitcher\" class=\"dealer-select\">';
        allDealers.forEach(function(name) {
            var selected = name === selectedDealer ? ' selected' : '';
            html += '<option value=\"' + escapeAttr(name) + '\"' + selected + '>' + escapeHtml(name) + '</option>';
        });
        var backLabel = reportModalState.fromLeaderboard ? 'Close' : 'Back to day view';
        html += '</select>' +
            '<button type=\"button\" class=\"details-btn\" id=\"clearDealerFilterBtn\">' + backLabel + '</button></div>';
    }

    var sortCol = reportModalState.sortColumn;
    var sortDir = reportModalState.sortDirection;
    html += '<table class=\"modal-table\"><thead><tr>';
    MODAL_COLUMNS.forEach(function(col) {
        var arrow = '';
        if (sortCol === col.key) {
            arrow = sortDir === 'asc' ? ' &#9650;' : ' &#9660;';
        }
        html += '<th class=\"sortable-th\" data-sort-key=\"' + col.key + '\">' + col.label + arrow + '</th>';
    });
    html += '</tr></thead><tbody>';

    visibleOrders.forEach(function(order) {
        const dealer = order.accountName || '--';
        const dealerCell = selectedDealer || dealer === '--'
            ? escapeHtml(dealer)
            : '<button type=\"button\" class=\"dealer-link\" data-dealer=\"' + escapeAttr(dealer) + '\">' + escapeHtml(dealer) + '</button>';
        const displayDate = order.reportDate ? formatDate(order.reportDate) : '--';

        html += '<tr>' +
            '<td>' + displayDate + '</td>' +
            '<td>' + dealerCell + '</td>' +
            '<td>' + escapeHtml(order.customerPO || '--') + '</td>' +
            '<td>' + escapeHtml(order.orderNumber || '--') + '</td>' +
            '<td>' + escapeHtml(order.product || '--') + '</td>' +
            '<td>' + escapeHtml(String(order.quantity || '--')) + '</td>' +
            '<td>' + formatCurrency(order.lineTotal || 0) + '</td>' +
            '</tr>';
    });

    html += '</tbody></table>';
    body.innerHTML = html;

    const clearBtn = document.getElementById('clearDealerFilterBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            if (reportModalState && reportModalState.fromLeaderboard) {
                closeReportModal();
            } else {
                clearDealerFilter();
            }
        });
    }

    var dealerSwitcher = document.getElementById('dealerSwitcher');
    if (dealerSwitcher) {
        dealerSwitcher.addEventListener('change', function() {
            filterByDealer(dealerSwitcher.value);
        });
    }

    body.querySelectorAll('.sortable-th[data-sort-key]').forEach(function(th) {
        th.addEventListener('click', function() {
            sortModalColumn(th.dataset.sortKey);
        });
    });

    body.querySelectorAll('.dealer-link[data-dealer]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            filterByDealer(btn.dataset.dealer);
        });
    });
}

function filterByDealer(dealerName) {
    if (!reportModalState) {
        return;
    }
    reportModalState.selectedDealer = dealerName;
    renderReportModalTable();
}

function clearDealerFilter() {
    if (!reportModalState) {
        return;
    }
    reportModalState.selectedDealer = null;
    renderReportModalTable();
}

function getDealerYtdOrders(dealerName) {
    const range = getYearRange(targetYear);
    const endIso = toISODate(range.rangeEnd);
    const results = [];

    salesData.forEach(function(entry) {
        const entryYear = new Date(entry.date).getFullYear();
        if (entryYear !== targetYear) {
            return;
        }
        if (entry.date > endIso) {
            return;
        }
        if (!Array.isArray(entry.orders) || entry.orders.length === 0) {
            return;
        }

        entry.orders.forEach(function(order) {
            if ((order.accountName || '--') === dealerName) {
                results.push(Object.assign({ reportDate: entry.date }, order));
            }
        });
    });

    results.sort(function(a, b) {
        return new Date(a.reportDate) - new Date(b.reportDate);
    });

    return results;
}

function escapeAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
}

function getYearRange(year) {
    const rangeStart = new Date(year, 0, 1);
    const fullYearEnd = new Date(year, 11, 31);
    const now = new Date();
    const thisYear = now.getFullYear();
    let rangeEnd = new Date(fullYearEnd);
    let elapsedDays = 0;

    if (year > thisYear) {
        rangeEnd = new Date(rangeStart);
        rangeEnd.setDate(rangeEnd.getDate() - 1);
        elapsedDays = 0;
    } else if (year === thisYear) {
        rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        elapsedDays = Math.floor((rangeEnd - rangeStart) / 86400000) + 1;
    } else {
        elapsedDays = Math.floor((fullYearEnd - rangeStart) / 86400000) + 1;
    }

    const totalDays = Math.floor((fullYearEnd - rangeStart) / 86400000) + 1;
    return {
        rangeStart: rangeStart,
        rangeEnd: rangeEnd,
        totalDays: totalDays,
        elapsedDays: Math.max(0, Math.min(totalDays, elapsedDays))
    };
}

function buildDailySeries(yearData, rangeStart, rangeEnd) {
    const dataByDate = new Map();
    yearData.forEach(function(entry) {
        dataByDate.set(entry.date, entry.amount);
    });

    if (rangeEnd < rangeStart) {
        return [];
    }

    const series = [];
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
        const year = cursor.getFullYear();
        const month = String(cursor.getMonth() + 1).padStart(2, '0');
        const day = String(cursor.getDate()).padStart(2, '0');
        const iso = year + '-' + month + '-' + day;

        series.push({
            date: iso,
            amount: dataByDate.get(iso) || 0
        });

        cursor.setDate(cursor.getDate() + 1);
    }

    return series;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

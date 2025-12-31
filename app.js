let inventory = JSON.parse(localStorage.getItem("inventory")) || [];

function saveInventory() {
  localStorage.setItem("inventory", JSON.stringify(inventory));
}

function addItem(item) {
  inventory.push(item);
  saveInventory();
  renderTable();
}

function updateQuantity(id, change) {
  const item = inventory.find(i => i.id === id);
  if (!item) return;
  item.quantity += change;
  saveInventory();
  renderTable();
}

function getStatus(item) {
  if (item.quantity <= 0) return "Out of Stock";
  if (item.quantity <= item.minLevel) return "Low Stock";
  return "In Stock";
}

function renderTable() {
  const tbody = document.getElementById("inventoryBody");
  tbody.innerHTML = "";

  inventory.forEach(item => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.id}</td>
      <td>${item.name}</td>
      <td>${item.category}</td>
      <td>${item.quantity}</td>
      <td>${item.location}</td>
      <td>${getStatus(item)}</td>
    `;
    tbody.appendChild(row);
  });
}

renderTable();

let movements = JSON.parse(localStorage.getItem("movements")) || [];

function logMovement(itemId, action, qty, note = "") {
  movements.push({
    timestamp: new Date().toLocaleString(),
    itemId,
    action,
    quantityChange: qty,
    note
  });
  localStorage.setItem("movements", JSON.stringify(movements));
}

function updateQuantity(id, change, note = "") {
  const item = inventory.find(i => i.id === id);
  if (!item) return;

  item.quantity += change;
  logMovement(id, change > 0 ? "ADD" : "REMOVE", change, note);
  saveInventory();
  renderTable();
  renderSummary();
}

let chart;

function renderSummary() {
  const categories = {};
  inventory.forEach(item => {
    categories[item.category] =
      (categories[item.category] || 0) + item.quantity;
  });

  const data = {
    labels: Object.keys(categories),
    datasets: [{
      label: "Quantity by Category",
      data: Object.values(categories)
    }]
  };

  if (chart) chart.destroy();

  chart = new Chart(document.getElementById("summaryChart"), {
    type: "bar",
    data
  });
}

let movements = JSON.parse(localStorage.getItem("movements")) || [];

function logMovement(itemId, action, qty, note = "") {
  movements.push({
    timestamp: new Date().toLocaleString(),
    itemId,
    action,
    quantityChange: qty,
    note
  });
  localStorage.setItem("movements", JSON.stringify(movements));
}

function updateQuantity(id, change, note = "") {
  const item = inventory.find(i => i.id === id);
  if (!item) return;

  item.quantity += change;
  logMovement(id, change > 0 ? "ADD" : "REMOVE", change, note);
  saveInventory();
  renderTable();
  renderSummary();
}


renderSummary();

renderTable();
renderMovements();
renderSummary();

function logMovement(item, delta, reason) {
  movements.push({
    id: `MOV-${Date.now()}`,
    timestamp: new Date().toISOString(),
    itemId: item.id,
    action: delta > 0 ? "ADD" : delta < 0 ? "REMOVE" : "ADJUST",
    beforeQty: item.quantity,
    afterQty: item.quantity + delta,
    delta,
    reason
  });

  localStorage.setItem("movements", JSON.stringify(movements));
}

function updateQuantity(id, delta, reason) {
  const item = inventory.find(i => i.id === id);
  if (!item) return;

  logMovement(item, delta, reason);
  item.quantity += delta;

  saveInventory();
  renderTable();
  renderMovements();
  renderSummary();
}

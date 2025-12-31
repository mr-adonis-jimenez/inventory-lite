function renderMovements() {
  const tbody = document.getElementById("movementBody");
  tbody.innerHTML = "";

  movements.slice().reverse().forEach(m => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${m.timestamp}</td>
      <td>${m.itemId}</td>
      <td>${m.action}</td>
      <td>${m.quantityChange}</td>
      <td>${m.note}</td>
    `;
    tbody.appendChild(row);
  });
}

renderMovements();

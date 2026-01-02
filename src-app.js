import { LocalVault } from './vault.js';

const vault = new LocalVault();
const form = document.getElementById('add-form');
const list = document.getElementById('inventory-list');

function render() {
  list.innerHTML = '';
  vault.listItems().forEach(item => {
    const row = document.createElement('li');
    row.innerHTML = `
      <strong>${item.name}</strong>
      (Qty: ${item.quantity}, Loc: ${item.location})
      <button data-id="${item.id}">Delete</button>
    `;
    row.querySelector('button').onclick = () => {
      vault.removeItem(item.id);
      render();
    };
    list.appendChild(row);
  });
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const name = form.name.value;
  const quantity = form.quantity.value;
  const location = form.location.value;

  vault.addItem({ name, quantity, location });
  form.reset();
  render();
});

render();

const API_BASE = '/store-api';

const state = {
  categories: [],
  products: [],
  brands: [],
  cart: [],
  filters: { q: '', category: '', brand: '', lifeStage: 'all', sizeProfile: 'all', sort: 'featured' },
  view: 'catalog'
};

const formatPrice = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

// DOM Elements
const contentEl = document.getElementById('app-content');
const cartOverlay = document.getElementById('cart-overlay');
const cartItemsEl = document.getElementById('cart-items');
const cartBtn = document.getElementById('cart-btn');
const closeCartBtn = document.getElementById('close-cart-btn');
const checkoutBtn = document.getElementById('checkout-btn');
const cartCountEl = document.getElementById('cart-count');
const cartSubtotalEl = document.getElementById('cart-subtotal');
const cartShippingEl = document.getElementById('cart-shipping');
const cartTotalEl = document.getElementById('cart-total');
const toastContainer = document.getElementById('toast-container');

// Core API Functions
async function apiGet(endpoint, params = {}) {
  const url = new URL(API_BASE + endpoint, window.location.origin);
  Object.keys(params).forEach(key => {
    if (params[key]) url.searchParams.append(key, params[key]);
  });
  const res = await fetch(url);
  return res.json();
}

async function apiPost(endpoint, body) {
  const res = await fetch(API_BASE + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Erro na requisição');
  }
  return res.json();
}

// Store logic
function addToCart(product) {
  const existing = state.cart.find(i => i.productId === product.id);
  if (existing) {
    if (existing.quantity >= product.stock) {
      showToast('Estoque insuficiente', 'error');
      return;
    }
    existing.quantity++;
  } else {
    state.cart.push({ productId: product.id, product, quantity: 1 });
  }
  showToast(`${product.name} adicionado ao carrinho!`, 'success');
  updateCartUI();
}

function updateCartQty(productId, delta) {
  const item = state.cart.find(i => i.productId === productId);
  if (!item) return;
  
  if (item.quantity + delta > item.product.stock) {
    showToast('Estoque máximo atingido', 'error');
    return;
  }
  
  item.quantity += delta;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter(i => i.productId !== productId);
  }
  updateCartUI();
}

function updateCartUI() {
  cartCountEl.textContent = state.cart.reduce((s, i) => s + i.quantity, 0);
  
  if (state.cart.length === 0) {
    cartItemsEl.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Seu carrinho está vazio.</p>';
    cartSubtotalEl.textContent = 'R$ 0,00';
    cartShippingEl.textContent = '-';
    cartTotalEl.textContent = 'R$ 0,00';
    checkoutBtn.disabled = true;
    return;
  }

  let subtotal = 0;
  cartItemsEl.innerHTML = state.cart.map(item => {
    subtotal += item.product.priceCents * item.quantity;
    return `
      <div class="cart-item">
        <img class="cart-item-img" src="${item.product.imageUrl || ''}" alt="">
        <div class="cart-item-details">
          <div class="cart-item-title">${item.product.name}</div>
          <div class="cart-item-price">${formatPrice(item.product.priceCents)}</div>
          <div class="cart-item-actions">
            <div class="qty-controls">
              <button class="qty-btn" onclick="updateCartQty('${item.productId}', -1)">-</button>
              <span>${item.quantity}</span>
              <button class="qty-btn" onclick="updateCartQty('${item.productId}', 1)">+</button>
            </div>
            <button class="remove-item" onclick="updateCartQty('${item.productId}', -999)">Remover</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  cartSubtotalEl.textContent = formatPrice(subtotal);
  const shipping = subtotal >= 19900 ? 0 : 1490;
  cartShippingEl.textContent = shipping === 0 ? 'Grátis' : formatPrice(shipping);
  cartTotalEl.textContent = formatPrice(subtotal + shipping);
  checkoutBtn.disabled = false;
}

// Components
window.updateCartQty = updateCartQty;
window.addToCartStr = (id) => {
  const p = state.products.find(x => x.id === id);
  if(p) addToCart(p);
}

async function renderCatalog() {
  state.view = 'catalog';
  contentEl.innerHTML = '<div class="loader"></div>';

  try {
    const activeFilters = { ...state.filters };
    if (activeFilters.lifeStage === 'all') delete activeFilters.lifeStage;
    if (activeFilters.sizeProfile === 'all') delete activeFilters.sizeProfile;

    const [catRes, prodRes] = await Promise.all([
      apiGet('/categories'),
      apiGet('/products', activeFilters)
    ]);
    
    state.categories = catRes.items || [];
    state.products = prodRes.items || [];
    state.brands = prodRes.meta?.availableBrands || [];
    
    // Build UI
    contentEl.innerHTML = `
      <div class="catalog-layout">
        <aside class="filters-panel">
          <div class="filter-group">
            <h3>Buscar</h3>
            <div class="form-group">
              <input type="text" id="filter-q" placeholder="Nome, sabor..." value="${state.filters.q}" oninput="updateFilter('q', this.value)">
            </div>
          </div>
          <div class="filter-group">
            <h3>Ordenar</h3>
            <select onchange="updateFilter('sort', this.value)">
              <option value="featured" ${state.filters.sort === 'featured' ? 'selected' : ''}>Destaques</option>
              <option value="price_asc" ${state.filters.sort === 'price_asc' ? 'selected' : ''}>Menor Preço</option>
              <option value="price_desc" ${state.filters.sort === 'price_desc' ? 'selected' : ''}>Maior Preço</option>
              <option value="name" ${state.filters.sort === 'name' ? 'selected' : ''}>Nome A-Z</option>
            </select>
          </div>
          <div class="filter-group">
            <h3>Categoria</h3>
            <select onchange="updateFilter('category', this.value)">
              <option value="">Todas</option>
              ${state.categories.map(c => `<option value="${c.id}" ${state.filters.category === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
            </select>
          </div>
          <div class="filter-group">
            <h3>Marca</h3>
            <select onchange="updateFilter('brand', this.value)">
              <option value="">Todas</option>
              ${state.brands.map(b => `<option value="${b}" ${state.filters.brand === b ? 'selected' : ''}>${b}</option>`).join('')}
            </select>
          </div>
          <div class="filter-group">
            <h3>Fase da Vida</h3>
            <select class="full-width" onchange="updateFilter('lifeStage', this.value)">
              <option value="all" ${state.filters.lifeStage === 'all' ? 'selected' : ''}>Todas</option>
              <option value="puppy" ${state.filters.lifeStage === 'puppy' ? 'selected' : ''}>Filhote</option>
              <option value="adult" ${state.filters.lifeStage === 'adult' ? 'selected' : ''}>Adulto</option>
              <option value="senior" ${state.filters.lifeStage === 'senior' ? 'selected' : ''}>Sênior</option>
            </select>
          </div>
          <div class="filter-group">
             <h3>Porte</h3>
             <select class="full-width" onchange="updateFilter('sizeProfile', this.value)">
                <option value="all" ${state.filters.sizeProfile === 'all' ? 'selected' : ''}>Todos</option>
                <option value="mini" ${state.filters.sizeProfile === 'mini' ? 'selected' : ''}>Mini / Pequeno</option>
                <option value="medium" ${state.filters.sizeProfile === 'medium' ? 'selected' : ''}>Médio</option>
                <option value="large" ${state.filters.sizeProfile === 'large' ? 'selected' : ''}>Grande</option>
             </select>
          </div>
        </aside>

        <section class="products-grid">
          ${state.products.length === 0 ? '<p style="grid-column: 1/-1; text-align:center; padding: 2rem; color: var(--text-muted)">Nenhum produto encontrado com estes filtros.</p>' : ''}
          ${state.products.map(p => `
            <div class="product-card">
              ${p.featured ? '<div class="badge-featured">DESTAQUE</div>' : ''}
              <div class="product-image">
                <img src="${p.imageUrl || ''}" alt="${p.name}">
              </div>
              <div class="product-category">${p.category ? p.category.name : p.brand}</div>
              <h3 class="product-name">${p.name}</h3>
              <div class="product-stock" style="color: ${p.stock > 0 ? 'var(--text-muted)' : 'var(--danger)'}">
                ${p.stock > 0 ? `🔥 Restam apenas ${p.stock} unidades` : '❌ Esgotado'}
              </div>
              <div class="product-price">
                ${formatPrice(p.priceCents)}
                ${p.compareAtCents > p.priceCents ? `<span class="product-compare-price">${formatPrice(p.compareAtCents)}</span>` : ''}
              </div>
              <button class="btn-primary full-width" style="margin-top: 1rem;" 
                onclick="addToCartStr('${p.id}')" ${!p.available || p.stock === 0 ? 'disabled' : ''}>
                ${p.available && p.stock > 0 ? 'Comprar 🐾' : 'Indisponível'}
              </button>
            </div>
          `).join('')}
        </section>
      </div>
    `;
  } catch(e) {
    contentEl.innerHTML = `<p style="color:var(--danger)">Erro ao carregar catálogo: ${e.message}</p>`;
  }
}

// Global hook for inputs
let filterTimeout;
window.updateFilter = (key, val) => {
  state.filters[key] = val;
  clearTimeout(filterTimeout);
  filterTimeout = setTimeout(() => renderCatalog(), 300);
}

function renderCheckout() {
  state.view = 'checkout';
  if (state.cart.length === 0) {
    showToast('Carrinho vazio', 'error');
    renderCatalog();
    return;
  }
  
  cartOverlay.classList.add('hidden');

  let subtotal = 0;
  const cartLines = state.cart.map(i => {
    subtotal += i.product.priceCents * i.quantity;
    return `
      <div class="cart-item">
        <div class="cart-item-details" style="flex-direction:row; justify-content:space-between">
          <span>${i.quantity}x ${i.product.name}</span>
          <span style="font-weight:700">${formatPrice(i.product.priceCents * i.quantity)}</span>
        </div>
      </div>
    `;
  }).join('');
  const shipping = subtotal >= 19900 ? 0 : 1490;
  const total = subtotal + shipping;

  contentEl.innerHTML = `
    <div class="checkout-layout">
      <div class="checkout-form">
        <button class="btn-outline" onclick="goHome()" style="margin-bottom: 2rem;">← Voltar para a loja</button>
        <form id="checkoutAuthForm" onsubmit="submitOrder(event)">
          <div class="checkout-section">
            <h2>Dados Pessoais</h2>
            <div class="form-grid">
              <div class="form-group full">
                <label>Nome Completo*</label>
                <input type="text" id="c-name" required value="Ana Souza">
              </div>
              <div class="form-group">
                <label>E-mail*</label>
                <input type="email" id="c-email" required value="ana@example.com">
              </div>
              <div class="form-group">
                <label>Telefone*</label>
                <input type="tel" id="c-phone" required value="11999999999">
              </div>
            </div>
          </div>
          <div class="checkout-section">
            <h2>Endereço de Entrega</h2>
            <div class="form-grid">
              <div class="form-group full">
                <label>CEP*</label>
                <input type="text" id="a-zip" required value="01311000">
              </div>
              <div class="form-group full">
                <label>Logradouro*</label>
                <input type="text" id="a-street" required value="Av Paulista">
              </div>
              <div class="form-group">
                <label>Número*</label>
                <input type="text" id="a-numero" required value="1000">
              </div>
              <div class="form-group">
                <label>Complemento</label>
                <input type="text" id="a-comp" value="Apto 42">
              </div>
              <div class="form-group">
                <label>Bairro*</label>
                <input type="text" id="a-district" required value="Bela Vista">
              </div>
              <div class="form-group">
                <label>Cidade*</label>
                <input type="text" id="a-city" required value="Sao Paulo">
              </div>
              <div class="form-group">
                <label>UF*</label>
                <input type="text" id="a-state" required value="SP" maxlength="2">
              </div>
              <div class="form-group full">
                <label>Observações de entrega</label>
                <textarea id="o-notes" placeholder="Ex: Deixar na portaria..."></textarea>
              </div>
            </div>
          </div>
          <button type="submit" class="btn-primary full-width" style="padding: 1.2rem; font-size:1.1rem" id="btn-finalizar">Confirmar Pagamento</button>
        </form>
      </div>

      <aside class="checkout-summary">
        <div class="checkout-section">
          <h2>Resumo do Pedido</h2>
          <div class="cart-items" style="padding:0; max-height:none; background:transparent">
            ${cartLines}
          </div>
          <div style="margin-top: 1.5rem">
            <div class="summary-line"><span>Subtotal</span><span>${formatPrice(subtotal)}</span></div>
            <div class="summary-line"><span>Frete</span><span>${shipping === 0 ? 'Grátis' : formatPrice(shipping)}</span></div>
            <div class="summary-line total"><span>Total</span><span style="color:var(--primary)">${formatPrice(total)}</span></div>
          </div>
        </div>
      </aside>
    </div>
  `;
}

window.goHome = () => {
  if (state.view !== 'catalog') renderCatalog();
};

window.submitOrder = async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-finalizar');
  btn.disabled = true;
  btn.textContent = 'Processando...';

  const payload = {
    customer: {
      name: document.getElementById('c-name').value,
      email: document.getElementById('c-email').value,
      phone: document.getElementById('c-phone').value,
    },
    address: {
      zipCode: document.getElementById('a-zip').value,
      street: document.getElementById('a-street').value,
      number: document.getElementById('a-numero').value,
      complement: document.getElementById('a-comp').value,
      district: document.getElementById('a-district').value,
      city: document.getElementById('a-city').value,
      state: document.getElementById('a-state').value,
    },
    items: state.cart.map(i => ({ productId: i.productId, quantity: i.quantity })),
    notes: document.getElementById('o-notes').value
  };

  try {
    const res = await apiPost('/orders', payload);
    state.cart = [];
    updateCartUI();
    renderConfirmation(res.order);
    showToast('Pedido concluído com sucesso!', 'success');
  } catch(error) {
    showToast(error.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Confirmar Pagamento';
  }
};

function renderConfirmation(order) {
  state.view = 'success';
  contentEl.innerHTML = `
    <div class="success-card">
      <div class="success-icon">✓</div>
      <h2>Compra Confirmada!</h2>
      <p style="color:var(--text-muted); margin-top:0.5rem">Obrigado por comprar conosco. Seu cãozinho agradece 🐾</p>
      
      <div class="order-number">${order.number}</div>
      
      <p style="margin-bottom: 2rem">Você receberá atualizações sobre o seu pedido no e-mail: <b>${order.customer.email}</b></p>
      
      <button class="btn-primary" onclick="goHome()">Voltar para a Loja</button>
    </div>
  `;
}

// Global UI handling
cartBtn.addEventListener('click', () => cartOverlay.classList.remove('hidden'));
closeCartBtn.addEventListener('click', () => cartOverlay.classList.add('hidden'));
cartOverlay.addEventListener('click', (e) => { if(e.target === cartOverlay) cartOverlay.classList.add('hidden') });
checkoutBtn.addEventListener('click', () => renderCheckout());

function showToast(msg, type='info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'fadeOut 0.3s forwards';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  const customLogo = document.querySelector('.logo');
  if(customLogo) customLogo.addEventListener('click', goHome);
  updateCartUI();
  renderCatalog();
});

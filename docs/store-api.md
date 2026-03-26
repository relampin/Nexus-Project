# API da Loja de Racao

Backend REST para uma loja de racao de cachorro, rodando no mesmo servidor Express do Nexus.

## Base URL

- `/store-api`

## Objetivo

- listar categorias e produtos
- filtrar catalogo por busca, categoria, marca, fase de vida e porte
- consultar produto por `id` ou `slug`
- criar pedido com validacao de estoque no servidor
- consultar pedido por `id` ou numero

## Persistencia

- arquivo: `data/store.json`
- se o arquivo nao existir, o backend sobe com seed inicial de categorias e produtos
- ao confirmar pedido, o estoque e decrementado no arquivo

## Endpoints

### `GET /store-api/health`

Retorna o status do backend da loja e um resumo operacional.

### `GET /store-api/categories`

Resposta:

```json
{
  "items": [
    {
      "id": "premium-dry",
      "slug": "premium-dry",
      "name": "Racao Seca Premium",
      "description": "Linhas premium para nutricao diaria equilibrada.",
      "productCount": 5
    }
  ]
}
```

### `GET /store-api/products`

Query params suportadas:

- `q`
- `category`
- `brand`
- `lifeStage`: `puppy`, `adult`, `senior`, `all`
- `sizeProfile`: `mini`, `medium`, `large`, `all`
- `onlyInStock`: `true` ou `false`
- `minPriceCents`
- `maxPriceCents`
- `sort`: `featured`, `price_asc`, `price_desc`, `name`

Resposta:

```json
{
  "items": [
    {
      "id": "golden-adulto-frango-15kg",
      "slug": "golden-adulto-frango-15kg",
      "categoryId": "premium-dry",
      "name": "Golden Formula Adulto Frango e Arroz 15kg",
      "brand": "Golden",
      "lifeStage": "adult",
      "sizeProfile": "medium",
      "flavor": "Frango e arroz",
      "priceCents": 18990,
      "compareAtCents": 20990,
      "weightKg": 15,
      "stock": 18,
      "featured": true,
      "active": true,
      "imageUrl": "/store-app/assets/golden-adulto-frango-15kg.jpg",
      "highlights": ["Alta digestibilidade", "Sem corantes artificiais", "Omega 3 e 6"],
      "category": {
        "id": "premium-dry",
        "slug": "premium-dry",
        "name": "Racao Seca Premium"
      },
      "available": true
    }
  ],
  "meta": {
    "total": 1,
    "filters": {
      "category": "premium-dry",
      "sort": "featured"
    },
    "availableBrands": ["Golden", "Premier"]
  }
}
```

### `GET /store-api/products/:id`

- aceita `id` ou `slug`
- retorna `404` se nao encontrar

### `POST /store-api/orders`

O backend calcula subtotal, frete e total.
Frete:

- gratis para subtotal a partir de `19900`
- `1490` abaixo desse valor

Payload:

```json
{
  "customer": {
    "name": "Ana Souza",
    "email": "ana@example.com",
    "phone": "11999999999"
  },
  "address": {
    "zipCode": "01311000",
    "street": "Av Paulista",
    "number": "1000",
    "district": "Bela Vista",
    "city": "Sao Paulo",
    "state": "SP",
    "complement": "Apto 42"
  },
  "items": [
    {
      "productId": "golden-adulto-frango-15kg",
      "quantity": 2
    }
  ],
  "notes": "Entregar em horario comercial"
}
```

Resposta:

```json
{
  "message": "Pedido confirmado com sucesso.",
  "order": {
    "id": "order-1742900000000-ab12cd",
    "number": "DOG-20260325-0001",
    "status": "confirmed",
    "customer": {
      "name": "Ana Souza",
      "email": "ana@example.com",
      "phone": "11999999999"
    },
    "address": {
      "zipCode": "01311000",
      "street": "Av Paulista",
      "number": "1000",
      "district": "Bela Vista",
      "city": "Sao Paulo",
      "state": "SP",
      "complement": "Apto 42"
    },
    "items": [
      {
        "productId": "golden-adulto-frango-15kg",
        "productName": "Golden Formula Adulto Frango e Arroz 15kg",
        "quantity": 2,
        "unitPriceCents": 18990,
        "lineTotalCents": 37980
      }
    ],
    "notes": "Entregar em horario comercial",
    "subtotalCents": 37980,
    "shippingCents": 0,
    "totalCents": 37980,
    "createdAt": "2026-03-25T13:40:00.000Z"
  }
}
```

Erros de validacao retornam `400`. Estoque insuficiente tambem retorna `400`.

### `GET /store-api/orders/:id`

- aceita `id` ou numero do pedido
- retorna `404` se nao encontrar

## Contrato para o frontend

- usar `/store-api` como origem de dados
- nunca calcular preco final do pedido no cliente como fonte de verdade
- considerar `priceCents`, `compareAtCents`, `subtotalCents`, `shippingCents` e `totalCents` como valores oficiais
- tratar `available: false` ou `stock === 0` como indisponivel
- se o frontend ficar em `frontend/store`, a visualizacao local fica em `/store-app`

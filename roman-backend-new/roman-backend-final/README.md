# 🌴 Роман — SaaS Бэкенд

Backend для тур-бота Роман. Поддерживает несколько агентств, хранит диалоги и лиды.

---

## 🚀 Быстрый старт

```bash
# 1. Установить зависимости
npm install

# 2. Настроить .env (уже создан, проверьте ADMIN_KEY)
nano .env

# 3. Запустить
npm start

# Для разработки (авто-перезапуск)
npm install -g nodemon
npm run dev
```

Сервер запустится на `http://localhost:3000`

---

## 📡 API Endpoints

### Для фронтенда (виджет агентства)

#### Начать сессию
```
POST /api/chat/start
Headers: x-agency-key: ragency_XXXX

Response:
{
  "session_id": "uuid",
  "bot_name": "Роман",
  "brand_color": "#0a7ea4"
}
```

#### Отправить сообщение
```
POST /api/chat/message
Headers: x-agency-key: ragency_XXXX

Body:
{
  "session_id": "uuid",
  "message": "текст от клиента",
  "client_data": {              // опционально — данные из формы
    "rest_type": "beach",
    "country": "🇹🇷 Турция",
    "budget": 60000,
    "stars": 5,
    "meal": "ai",
    "wishes": "с детьми"
  }
}

Response:
{
  "reply": "текст ответа Романа",
  "action": "none"             // или "manager" когда надо передать менеджеру
}
```

#### Конфиг агентства (для кастомизации виджета)
```
GET /api/agency/config
Headers: x-agency-key: ragency_XXXX

Response:
{
  "bot_name": "Роман",
  "brand_color": "#0a7ea4",
  "plan": "pro",
  "dialogs_left": 850
}
```

#### Статистика и лиды
```
GET /api/agency/stats
GET /api/agency/leads
Headers: x-agency-key: ragency_XXXX
```

---

### Для администратора (вы)

Все admin-запросы требуют заголовок: `x-admin-key: ВАШ_ADMIN_KEY`

#### Создать агентство
```
POST /admin/agencies

Body:
{
  "name": "Турагентство Солнышко",
  "bot_name": "Алекс",
  "brand_color": "#e55a2b",
  "plan": "pro",
  "anthropic_key": null        // если у них есть свой ключ
}

Response:
{
  "id": "uuid",
  "api_key": "ragency_XXXX",   // ← выдать агентству
  "plan": "pro",
  "dialogs_limit": 1000
}
```

#### Список агентств
```
GET /admin/agencies
```

#### Статистика агентства
```
GET /admin/agencies/:id/stats
```

#### Обновить агентство
```
PUT /admin/agencies/:id

Body: { "plan": "enterprise", "dialogs_limit": 5000, "active": 1 }
```

#### Все лиды
```
GET /admin/leads
```

---

## 💰 Тарифные планы

| План       | Диалогов/мес | Рекомендуемая цена |
|------------|-------------|-------------------|
| starter    | 100         | 3 000 ₽/мес       |
| pro        | 1 000       | 9 900 ₽/мес       |
| enterprise | ∞           | договорная        |

---

## 🗂 Структура базы данных

```
agencies     — агентства и их настройки
sessions     — диалоги клиентов
messages     — все сообщения по сессиям
leads        — горячие лиды (клиент дошёл до менеджера)
```

---

## 🌐 Деплой на Railway (бесплатно)

```bash
# 1. Установить Railway CLI
npm install -g @railway/cli

# 2. Войти
railway login

# 3. Создать проект
railway init

# 4. Добавить переменные окружения
railway variables set ANTHROPIC_KEY=sk-ant-...
railway variables set ADMIN_KEY=ваш_секретный_ключ

# 5. Деплой
railway up
```

После деплоя получите URL вида: `https://roman-backend.railway.app`

---

## 🔗 Подключение виджета к бэкенду

В файле `roman-tour-bot.html` замените:
```js
// БЫЛО (прямой запрос к Anthropic — небезопасно)
const res = await fetch('https://api.anthropic.com/v1/messages', ...)

// СТАЛО (через ваш бэкенд)
const res = await fetch('https://ВАШ_СЕРВЕР/api/chat/message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-agency-key': 'ragency_XXXX'   // ключ агентства
  },
  body: JSON.stringify({ session_id, message, client_data })
})
```

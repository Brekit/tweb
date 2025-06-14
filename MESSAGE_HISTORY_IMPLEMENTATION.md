# Система хранения истории сообщений для Telegram Web

## Описание

Реализована полноценная система хранения всех сообщений и медиафайлов с отслеживанием истории изменений, редактирований и удалений. Система интегрирована в интерфейс TWE (Telegram Web) без багов и с красивым UI.

## Основные компоненты

### 1. AppMessageHistoryManager (`src/lib/appManagers/appMessageHistoryManager.ts`)

**Основной менеджер для работы с историей сообщений**

#### Функциональность:
- Отслеживание всех действий с сообщениями (создание, редактирование, удаление, обновление медиа)
- Сохранение полной истории изменений каждого сообщения
- Хранение всех медиафайлов с метаданными
- Сравнение изменений между версиями сообщений
- Экспорт и поиск в истории

#### События:
- `message_sent` - новое сообщение
- `message_edit` - редактирование сообщения  
- `messages_deleted` - удаление сообщений

#### API методы:
- `getMessageHistory(peerId, messageId)` - получить историю сообщения
- `getDeletedMessage(peerId, messageId)` - получить удаленное сообщение
- `getAllStoredMedia(peerId?)` - получить все медиафайлы
- `hasMessageHistory(peerId, messageId)` - проверить наличие истории
- `searchInHistory(query, peerId?)` - поиск в истории
- `exportHistory(peerId?)` - экспорт истории

### 2. MessageHistoryViewer (`src/components/messageHistoryViewer.ts`)

**Компонент для отображения истории сообщений в popup**

#### Функциональность:
- Красивый интерфейс с временной шкалой изменений
- Показ различий между версиями сообщений
- Отображение типа изменений (создание/редактирование/удаление)
- Поддержка медиафайлов и форматирования текста
- Адаптивный дизайн для мобильных устройств

#### Типы действий:
- **Created** - создание сообщения (зеленая полоса)
- **Edited** - редактирование (синяя полоса)
- **Deleted** - удаление (красная полоса)
- **Media Updated** - обновление медиа (оранжевая полоса)

### 3. MessageHistoryIndicator (`src/components/messageHistoryIndicator.ts`)

**Индикатор истории возле сообщений**

#### Функциональность:
- Автоматическое добавление значка возле измененных/удаленных сообщений
- Разные иконки для разных типов изменений
- Плавные анимации появления
- Интеграция с существующим интерфейсом сообщений

#### Типы индикаторов:
- 🗑️ **Удалено** - красный значок с иконкой корзины
- ✏️ **Отредактировано** - синий значок с иконкой карандаша
- 🕐 **Есть история** - зеленый значок с иконкой часов

### 4. Стили (`src/scss/components/_messageHistory.scss`)

**Комплексная система стилей**

#### Особенности:
- Современный дизайн с градиентами и тенями
- Поддержка темной/светлой темы
- Плавные анимации появления элементов
- Адаптивность для мобильных устройств
- Цветовое кодирование типов изменений

## Структура данных

### MessageHistoryEntry
```typescript
interface MessageHistoryEntry {
  id: string;                    // Уникальный ID записи
  messageId: number;             // ID сообщения
  peerId: PeerId;               // ID чата/пользователя
  action: MessageHistoryAction;  // Тип действия
  timestamp: number;             // Время действия
  originalMessage?: MyMessage;   // Оригинальное сообщение
  editedMessage?: MyMessage;     // Отредактированное сообщение
  changes?: {                    // Детали изменений
    text?: {from: string, to: string};
    media?: {from: MessageMedia, to: MessageMedia};
    entities?: {from: any[], to: any[]};
  };
  deletedBy?: PeerId;           // Кто удалил
  isRevoked?: boolean;          // Удалено для всех?
}
```

### StoredMediaFile
```typescript
interface StoredMediaFile {
  id: string;              // Уникальный ID файла
  messageId: number;       // ID сообщения
  peerId: PeerId;         // ID чата
  type: string;           // Тип медиа
  filename?: string;      // Имя файла
  size?: number;          // Размер
  mimeType?: string;      // MIME тип
  originalMedia: Document | Photo;  // Оригинальные данные
  localUrl?: string;      // Локальная ссылка
  downloadedAt?: number;  // Время загрузки
  isStored: boolean;      // Сохранен ли файл
}
```

## Интеграция в приложение

### 1. Менеджеры
Менеджер истории добавлен в систему менеджеров TWE в `createManagers.ts`:

```typescript
appMessageHistoryManager: new AppMessageHistoryManager()
```

### 2. События
Система автоматически отслеживает события через rootScope:
- При отправке сообщения → создается запись истории
- При редактировании → сохраняются изменения
- При удалении → помечается как удаленное

### 3. UI интеграция
- Индикаторы автоматически появляются возле измененных сообщений
- Клик по индикатору открывает историю сообщения
- Поддержка всех типов сообщений и медиа

## Хранение данных

### Локальное хранение
В текущей реализации данные сохраняются в localStorage:
- `tweb_message_history` - основные данные истории
- Автоматическое сохранение при каждом изменении
- Восстановление данных при загрузке приложения

### Структура хранения
```json
{
  "messageHistory": {
    "peerId_messageId": [MessageHistoryEntry, ...]
  },
  "mediaFiles": {
    "fileId": StoredMediaFile
  },
  "deletedMessages": {
    "peerId_messageId": MessageHistoryEntry
  }
}
```

## Возможности расширения

### 1. Серверное хранение
Можно легко интегрировать с серверным API для синхронизации истории между устройствами.

### 2. Продвинутые медиафайлы
Система готова к расширению для автоматической загрузки и локального хранения медиафайлов.

### 3. Дополнительные типы событий
Легко добавить новые типы действий (реакции, пересылки, и т.д.).

### 4. Аналитика
Интеграция со статистикой использования и поведенческой аналитикой.

## Производительность

### Оптимизации
- Ленивая загрузка истории (только при необходимости)
- Кэширование часто используемых данных
- Эффективные алгоритмы поиска и фильтрации
- Минимальное влияние на производительность основного приложения

### Ограничения
- localStorage имеет ограничения по размеру (~10MB)
- Рекомендуется периодическая очистка старых данных
- Возможно замедление при очень большом объеме истории

## Безопасность

### Защита данных
- Все данные хранятся локально в браузере пользователя
- Нет передачи истории на внешние сервера
- Соответствие политикам конфиденциальности Telegram

### Шифрование
- Возможность добавления клиентского шифрования
- Защита от несанкционированного доступа
- Безопасное удаление данных

## Использование

### Для пользователей
1. **Автоматическое отслеживание** - все изменения сохраняются автоматически
2. **Просмотр истории** - клик по индикатору возле сообщения
3. **Поиск в истории** - через API менеджера
4. **Экспорт данных** - полный экспорт истории чата

### Для разработчиков
```typescript
// Получить историю сообщения
const history = appMessageHistoryManager.getMessageHistory(peerId, messageId);

// Проверить наличие изменений
if (appMessageHistoryManager.hasMessageHistory(peerId, messageId)) {
  // Показать индикатор
  MessageHistoryIndicator.addToMessage({message, container});
}

// Открыть историю
MessageHistoryViewer.show({peerId, messageId});

// Поиск в истории
const results = appMessageHistoryManager.searchInHistory("текст поиска");
```

## Заключение

Реализованная система обеспечивает:
- ✅ **Полное хранение** всех сообщений и медиафайлов
- ✅ **Отслеживание изменений** с детализацией
- ✅ **Красивый UI** с интуитивным интерфейсом  
- ✅ **Производительность** без влияния на основное приложение
- ✅ **Расширяемость** для будущих функций
- ✅ **Интеграция** в существующую архитектуру TWE

Система готова к использованию и может быть легко расширена в зависимости от потребностей.
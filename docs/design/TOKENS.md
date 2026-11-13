# Дизайн-токены

## Доводка07.11.2026 — актуальное уточнение реализации

[Матрица ревью P0/P1](UI_REVIEW_2026-11-07.md): mobile nav имеет собственную intrinsic flex-высоту с safe-area, не fixed overlay. Shell — visualViewport.height / fallback100dvh; Workspace — единственная mobile область прокрутки. Desktop sidebar216px от1100 сохранён. Badges/eyebrow/nav/legend12px, context/meta12–13px; desktop compact title2строки, полное mobile название без clamp, title textarea auto-height с ограничением по доступной высоте. Даты ДД.ММ.ГГГГ, время24h, canonical API ISO/HH:mm. Это делегированные UI-параметры, не новые бизнес-правила/цвета/шрифты. Исторические строки ниже о fixed nav/padding относятся к baseline7208c2d.


## Реализация Issue #34 — актуальные значения для ревью

Источник CSS — [globals.css](../../src/app/globals.css), основание — [утверждение v3](APPROVED_V3_IMPLEMENTATION.md), ассеты — [inventory](ASSET_INVENTORY_V3.md). Исторические H1/H3 таблицы ниже сохраняют предыдущие состояния; их TBD не отменяют эту делегированную реализацию. APPROVED: четыре HEX, Literata/Onest, minimum360 и QA390/1280. Остальные числа — **IMPLEMENTED / delegated**, не извлечённые Figma variables и не новые owner-approved product rules.

| Роль | Значение реализации |
| --- | --- |
| Brand / основной текст / lavender / canvas | #753A4A / #25283B / #E7E0F2 / #F7F4EE — утверждено |
| Card / muted text / divider | #FFFFFF / #6F6268 / #E7E0DE |
| Control border / rose / soft surface | #95828A / #FBE4E9 / #F4F1ED |
| Error / success | #A1263F / #1C6951, всегда также текст/иконка |
| Display / body+label | Literata variable200–900, настоящий italic; Onest variable100–900 normal; font-synthesis:none |
| Основной текст / input | .875rem/1.55; input1rem, minimum44px height |
| Display scale | h1≈1.7–2.2rem, карточки1.1–1.6rem; реальные selectors — CSS; rem поддерживает text resize |
| Spacing / radius | Основные gaps8/12/16/20/24px; карточки14px, controls7–8px, pills999px |
| Focus / touch | Outline3px brand с offset4px; button/input min44px; ссылки nav min44px |
| Сетка | Sidebar216px от1100px; STAFF inspector17.875rem (286px при16px root) от900px,19.375rem (310px) от1450px |
| Media thresholds | 700px: дополнительные колонки;900px: STAFF table/inspector;1100px:sidebar;1450px:широкая настройка.360/390/1280 — QA viewports, не media queries |
| Motion | Нет обязательной анимации; при prefers-reduced-motion scroll:auto и transition/animation подавлены |

Контраст считается WCAG sRGB без округления перед сравнением, body threshold4.5:1. E2E измеряет **computed** foreground/background видимых eyebrow/badge/lesson/current/timetable/nav после загрузки шрифтов; это smoke, не полный аудит WCAG. Контрольные пары: brand/white≈8.53, ink/paper≈13.24, brand/paper≈7.77; точные значения второстепенных пар и результаты — [UI QA](../screenshots/issue-34/README.md). Светлый divider декоративный, не единственная граница input; controls используют отдельный более тёмный border. Статусы дополнены «Сейчас», «Завершено», «Отменено», «Выбрано», не только цветом. Темизация/dark mode не добавлялись.


> **Обновление решения владельца 06.11.2026:** целевые шрифты для UI теперь **Literata** (display) и **Onest** (body/label), вместо исторических Newsreader / Plus Jakarta Sans. Палитра остаётся без изменений. Codex уполномочен определить недостающие второстепенные токены с проверкой доступности; см. [APPROVED_V3_IMPLEMENTATION](APPROVED_V3_IMPLEMENTATION.md). Любые более ранние строки v3 о «целевых Newsreader / Plus Jakarta Sans» имеют исторический статус.

**Актуальная база — Design Handoff v3 / [Issue #31](https://github.com/bam-low/mgimo/issues/31), см. раздел v3 ниже и [REDESIGN_V3](REDESIGN_V3.md).** Следующая таблица H1 сохраняет историю на 04.11.2026: её TBD не отменяют позднее утверждённые четыре HEX и семейства. Значения H1 не являются второй параллельной темой. Числа CSS реализации #29 не утверждены как tokens v3.


Источник H1 — [Issue #5, Design Handoff v1 от 04.11.2026](https://github.com/bam-low/mgimo/issues/5), разделы 3–4 и 6. Это документационная схема, не CSS/JSON и не готовая тема. Общий контекст — [DESIGN](../DESIGN.md).

Статусы: «утверждено» — явное решение владельца; «предложено» — схема/имя ещё не обязательны; «открытый вопрос» — роль задана handoff, значение не утверждено. TBD в значении или единице не является default. Все числовые параметры стилей, кроме 360/390, остаются TBD. Поведенческий прогресс 0–100% описан в компонентах и не задаёт размеры стилей.

| Путь | Назначение | Значение | Единица | Статус | Источник | Примечание |
| --- | --- | --- | --- | --- | --- | --- |
| `color.brand.primary` | Семантический цвет brand/primary | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.brand.secondary` | Семантический цвет brand/secondary | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.text.primary` | Семантический цвет text/primary | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.text.secondary` | Семантический цвет text/secondary | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.text.inverse` | Семантический цвет text/inverse | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.surface.canvas` | Семантический цвет surface/canvas | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.surface.base` | Семантический цвет surface/base | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.surface.raised` | Семантический цвет surface/raised | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.surface.inverse` | Семантический цвет surface/inverse | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.border.default` | Семантический цвет border/default | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.border.strong` | Семантический цвет border/strong | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.state.active` | Семантический цвет state/active | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.state.upcoming` | Семантический цвет state/upcoming | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.state.completed` | Семантический цвет state/completed | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.state.empty` | Семантический цвет state/empty | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.state.error` | Семантический цвет state/error | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.state.success` | Семантический цвет state/success | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.state.warning` | Семантический цвет state/warning | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `color.focus.ring` | Семантический цвет focus/ring | TBD | TBD | открытый вопрос | H1 | Характер палитры не задаёт HEX; состояние обозначается также текстом/формой. |
| `typography.family.display` | Семейство display | TBD | TBD | открытый вопрос | H1 | Lora/Inter — только примеры; файлы и лицензии не подтверждены. |
| `typography.family.body` | Семейство body | TBD | TBD | открытый вопрос | H1 | Lora/Inter — только примеры; файлы и лицензии не подтверждены. |
| `typography.family.mono` | Семейство mono | TBD | TBD | открытый вопрос | H1 | Lora/Inter — только примеры; файлы и лицензии не подтверждены. |
| `typography.weight.regular` | Вес regular | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `typography.weight.medium` | Вес medium | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `typography.weight.semibold` | Вес semibold | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `typography.weight.bold` | Вес bold | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `typography.size.display` | size для display | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `typography.size.h1` | size для h1 | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `typography.size.h2` | size для h2 | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `typography.size.h3` | size для h3 | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `typography.size.body` | size для body | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `typography.size.caption` | size для caption | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `typography.size.label` | size для label | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `typography.lineHeight.display` | lineHeight для display | TBD | TBD | открытый вопрос | H1 | Для lineHeight/letterSpacing развёртка * по ролям — предложение; чисел нет. |
| `typography.lineHeight.h1` | lineHeight для h1 | TBD | TBD | открытый вопрос | H1 | Для lineHeight/letterSpacing развёртка * по ролям — предложение; чисел нет. |
| `typography.lineHeight.h2` | lineHeight для h2 | TBD | TBD | открытый вопрос | H1 | Для lineHeight/letterSpacing развёртка * по ролям — предложение; чисел нет. |
| `typography.lineHeight.h3` | lineHeight для h3 | TBD | TBD | открытый вопрос | H1 | Для lineHeight/letterSpacing развёртка * по ролям — предложение; чисел нет. |
| `typography.lineHeight.body` | lineHeight для body | TBD | TBD | открытый вопрос | H1 | Для lineHeight/letterSpacing развёртка * по ролям — предложение; чисел нет. |
| `typography.lineHeight.caption` | lineHeight для caption | TBD | TBD | открытый вопрос | H1 | Для lineHeight/letterSpacing развёртка * по ролям — предложение; чисел нет. |
| `typography.lineHeight.label` | lineHeight для label | TBD | TBD | открытый вопрос | H1 | Для lineHeight/letterSpacing развёртка * по ролям — предложение; чисел нет. |
| `typography.letterSpacing.display` | letterSpacing для display | TBD | TBD | открытый вопрос | H1 | Для lineHeight/letterSpacing развёртка * по ролям — предложение; чисел нет. |
| `typography.letterSpacing.h1` | letterSpacing для h1 | TBD | TBD | открытый вопрос | H1 | Для lineHeight/letterSpacing развёртка * по ролям — предложение; чисел нет. |
| `typography.letterSpacing.h2` | letterSpacing для h2 | TBD | TBD | открытый вопрос | H1 | Для lineHeight/letterSpacing развёртка * по ролям — предложение; чисел нет. |
| `typography.letterSpacing.h3` | letterSpacing для h3 | TBD | TBD | открытый вопрос | H1 | Для lineHeight/letterSpacing развёртка * по ролям — предложение; чисел нет. |
| `typography.letterSpacing.body` | letterSpacing для body | TBD | TBD | открытый вопрос | H1 | Для lineHeight/letterSpacing развёртка * по ролям — предложение; чисел нет. |
| `typography.letterSpacing.caption` | letterSpacing для caption | TBD | TBD | открытый вопрос | H1 | Для lineHeight/letterSpacing развёртка * по ролям — предложение; чисел нет. |
| `typography.letterSpacing.label` | letterSpacing для label | TBD | TBD | открытый вопрос | H1 | Для lineHeight/letterSpacing развёртка * по ролям — предложение; чисел нет. |
| `spacing.0` | Шаг отступа 0 | TBD | TBD | предложено | H1 | Имя шага — предложение, не пиксельное значение; даже spacing.0 не задан. |
| `spacing.1` | Шаг отступа 1 | TBD | TBD | предложено | H1 | Имя шага — предложение, не пиксельное значение; даже spacing.0 не задан. |
| `spacing.2` | Шаг отступа 2 | TBD | TBD | предложено | H1 | Имя шага — предложение, не пиксельное значение; даже spacing.0 не задан. |
| `spacing.3` | Шаг отступа 3 | TBD | TBD | предложено | H1 | Имя шага — предложение, не пиксельное значение; даже spacing.0 не задан. |
| `spacing.4` | Шаг отступа 4 | TBD | TBD | предложено | H1 | Имя шага — предложение, не пиксельное значение; даже spacing.0 не задан. |
| `spacing.5` | Шаг отступа 5 | TBD | TBD | предложено | H1 | Имя шага — предложение, не пиксельное значение; даже spacing.0 не задан. |
| `spacing.6` | Шаг отступа 6 | TBD | TBD | предложено | H1 | Имя шага — предложение, не пиксельное значение; даже spacing.0 не задан. |
| `spacing.8` | Шаг отступа 8 | TBD | TBD | предложено | H1 | Имя шага — предложение, не пиксельное значение; даже spacing.0 не задан. |
| `spacing.10` | Шаг отступа 10 | TBD | TBD | предложено | H1 | Имя шага — предложение, не пиксельное значение; даже spacing.0 не задан. |
| `spacing.12` | Шаг отступа 12 | TBD | TBD | предложено | H1 | Имя шага — предложение, не пиксельное значение; даже spacing.0 не задан. |
| `layout.page.gutter` | Роль layout.page.gutter | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `layout.page.contentMax` | Роль layout.page.contentMax | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `layout.section.gap` | Роль layout.section.gap | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `radius.none` | Роль radius.none | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `radius.sm` | Роль radius.sm | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `radius.md` | Роль radius.md | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `radius.lg` | Роль radius.lg | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `radius.pill` | Роль radius.pill | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `border.width.default` | Роль border.width.default | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `border.width.strong` | Роль border.width.strong | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `shadow.card` | Роль shadow.card | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `shadow.overlay` | Роль shadow.overlay | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `icon.size.sm` | Роль icon.size.sm | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `icon.size.md` | Роль icon.size.md | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `icon.size.lg` | Роль icon.size.lg | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `motion.duration.fast` | Роль motion.duration.fast | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `motion.duration.normal` | Роль motion.duration.normal | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `motion.easing.standard` | Роль motion.easing.standard | TBD | TBD | открытый вопрос | H1 | Значение требует утверждения. |
| `motion.reduced` | Роль motion.reduced | TBD | TBD | открытый вопрос | H1 | Поддержка reduced motion обязательна, конкретное поведение TBD. |
| `breakpoint.mobileMin` | Минимальная ширина mobile-first | 360 | CSS px | утверждено | H1 | Значение требует утверждения. |
| `viewport.studentReference` | Ширина эталона главной студента | 390 | CSS px | утверждено | H1 | Целевая ширина; концепция № 1 на design_concept.png получена; точный source-макет ASSET_NOT_PROVIDED. |
| `breakpoint.tablet` | Переход к широкому layout | TBD | TBD | предложено | H1 | Имя дополнительной роли — предложение; значение не утверждено. |
| `breakpoint.desktop` | Переход к широкому layout | TBD | TBD | предложено | H1 | Имя дополнительной роли — предложение; значение не утверждено. |

Семантические роли обязательны: активность пары не кодируется одним бордовым цветом. Отдельно требуется утвердить цветовые пары/контрастность/прозрачность, набор состояний интерактивных элементов, единицы и шкалы. Имена не подразумевают готовый Tailwind preset. Таблица не утверждает семейства или лицензии шрифтов; неподтверждённые значения не извлекаются из растра.

## Design Handoff v3 — актуальная база

H3 — [Issue #31](https://github.com/bam-low/mgimo/issues/31); SB3 — [оригинальный styleboard](assets/academic-editorial-styleboard-v3.png), [передача владельцем](https://github.com/bam-low/mgimo/issues/31#issuecomment-6692839582). Это Markdown-спецификация, не реализация CSS/JSON/темы. Смена базы не изменяет приложение.

| Canonical path | Значение | Единица | Статус | Источник / граница |
| --- | --- | --- | --- | --- |
| `color.brand.primary` | `#753A4A` | HEX sRGB | APPROVED | H3 + подписанный Primary SB3; ограниченный акцент, не сплошной бордовый canvas |
| `color.brand.secondary` | `#25283B` | HEX sRGB | APPROVED | H3 + Secondary SB3; роль text.primary отдельно не утверждена |
| `color.brand.tertiary` | `#E7E0F2` | HEX sRGB | APPROVED | H3 + Tertiary SB3; нельзя считать готовым цветом читабельного текста |
| `color.surface.neutral` | `#F7F4EE` | HEX sRGB | APPROVED | H3 + Neutral SB3 |
| `typography.display.family` | Newsreader | font-family name | APPROVED намерение | H3 + Headline SB3; конкретный кириллический font asset/fallback OPEN |
| `typography.body.family` | Plus Jakarta Sans | font-family name | APPROVED намерение | H3 + Body SB3; glyph coverage исследованных файлов недостаточно |
| `typography.label.family` | Plus Jakarta Sans | font-family name | APPROVED намерение | H3 + Label SB3; это не утверждение веса/размера |
| `viewport.mobileMinimum` | 360 | CSS px | APPROVED | H1/H3, минимальная контрольная ширина |
| `viewport.studentReference` | 390 | CSS px | APPROVED | H1/H3, student mobile node 1:689; pixel geometry текста не проверена |
| `viewport.desktopReference` | 1280 | CSS px | APPROVED | H3, student/staff desktop nodes 1:910 / 1:2 |

Различать `viewport.*` и `breakpoint.*`: ширина фрейма не утверждает media query. Имена H1 `typography.family.display/body` — исторические; переход к canonical `typography.display/body.family` — схема документа v3, не требование дублировать значения в коде. Новый нейтральный цвет не автоматически задаёт все surface/canvas/card роли.

| Семантические пути v3 | Значения / единицы | Статус | Ограничение / источник |
| --- | --- | --- | --- |
| `color.text.primary`, `.secondary`, `.muted`, `.inverse` | TBD | OPEN значения; PROPOSED детализация ролей | В SB3 нет утверждённой матрицы text/background; brand secondary → text primary только предложение для ревью |
| `color.surface.canvas`, `.base`, `.raised`, `.inverse`, `.selected` | TBD | OPEN | Alias canvas → neutral PROPOSED; белый/новые оттенки не брать пипеткой |
| `color.border.default`, `.strong`, `.selected` | TBD | OPEN / PROPOSED роли | Семантические пары и толщина линии отдельно не утверждены |
| `color.state.active`, `.upcoming`, `.completed`, `.cancelled`, `.empty`, `.error`, `.success`, `.warning` | TBD | OPEN / PROPOSED роли | Статусы занятия/формы не являются HEX; Current ≠ выбранная ячейка inspector |
| `color.focus.ring`, `color.action.*` | TBD | OPEN | Focus/hover/pressed/disabled нужны; конкретная палитра/контрастные пары не переданы |
| `typography.display/body/label.size`, `.weight`, `.lineHeight`, `.letterSpacing` | TBD | OPEN | Размеры/веса/метрики слетевшего Figma-текста не эталон |
| `typography.display/body/label.asset`, `.fallback`, `typography.display.opticalSize` | TBD | OPEN, gate перед UI | [Проверка font assets и кириллицы](REDESIGN_V3.md); доступные variable axes не утверждают значения UI |
| `spacing.pageGutter`, `.sectionGap`, `.controlGap`, `.gridGap`, `.inlineGap` | TBD | PROPOSED семантическая схема / OPEN значения | Шкала и единицы не извлекаются из растра |
| `radius.control`, `.card`, `.panel`, `.pill` | TBD | PROPOSED роли / OPEN значения | SB3 показывает мягкие формы, но не подтверждает numeric radius |
| `shadow.card`, `.overlay`, `.inspector` | TBD | PROPOSED роли / OPEN значения | Не назначать тень всем поверхностям по одному референсу |
| `motion.duration.*`, `.easing.*`, `.reduced` | TBD | PROPOSED роли / OPEN значения | Reduced motion обязателен; визуальная анимация не меняет реальный clock/progress |
| `breakpoint.compact`, `.wide`, `.staffInspector` | TBD | PROPOSED роли / OPEN значения | Переходы между 360/390/1280 требуют ревью; это не готовая сетка |
| `layout.*`, `icon.size.*`, `icon.strokeWidth`, `icon.assetSet` | TBD | OPEN | Число колонок/точные размеры/библиотека/лицензии не подтверждены |

### Измеренный контраст — не утверждение назначения цветов

Расчёт WCAG relative luminance по четырём известным sRGB HEX (06.11.2026): primary/neutral **7.77:1**, secondary/neutral **13.24:1**, primary/tertiary **6.64:1**, tertiary/neutral **1.17:1**. Это арифметическая проверка пар, не валидация готового интерфейса/opacity/hover/focus и не утверждение semantic mapping. Последнюю пару нельзя выдавать за читабельный текст без проверки. PROPOSED — принять WCAG 2.2 AA как цель будущей реализации; стандарт/пороги и конкретные text/control пары требуют решения владельца. Все неизвестные значения остаются TBD.

## Уточнение исполнения #46 — для ручного визуального ревью

Источник: явное поручение владельца после аудита 6.5, [A46](../DECISIONS.md). Основные цвета и Literata/Onest сохраняются. Делегированные значения новой реализации: sidebar 232px, radius карточки 13px, rose #FFDCE5, soft #F2EEE8; мобильная шапка 64px, desktop 88px, min-height изменённых действий 44px. Выход один, общий для защищённых страниц, на линии бренда. Эти значения — решения исполнения по трём owner PNG, не извлечённые Figma variables. Сводка главной показывает действительные последние записи, без GPA и фиктивных totals. [Снимки/проверка контраста/ограничения](../screenshots/issue-46/REVIEW.md).

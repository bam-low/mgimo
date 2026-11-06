# UI Issue #34 — evidence и ручная приёмка

Screenshots настоящего локального standalone-приложения, PostgreSQL17, исключительно вымышленные данные. Не Figma exports и не production. Реальное серверное время; текущая пара/процент могут отличаться в повторном прогоне. Браузер в America/Los_Angeles намеренно отличается от Europe/Moscow вуза; UI считает по вузу. Full-page mobile показывает fixed bottom navigation на границе первого viewport — это артефакт способа захвата, при прокрутке nav остаётся у нижнего края экрана.

| Роль | 360px | 390px | 1280px |
| --- | --- | --- | --- |
| STUDENT | [Сегодня](student-360.png) | [Сегодня](student-390.png) | [Главная](student-1280.png) |
| STAFF | [Дни + inspector](staff-360.png) | [Дни + inspector](staff-390.png) | [Week grid + inspector](staff-1280.png) |

[Три owner PNG и provenance](../../design/ASSET_INVENTORY_V3.md). Сохранены кремовый canvas, мягкие белые поверхности, редакционные заголовки, акценты brand/lavender, sidebar/нижняя nav, student hero/current/agenda/aside, STAFF week-grid/right inspector. Отличия: Literata/Onest вместо ошибочного Liberation Serif; собственная простая архитектурная/учебная SVG-графика вместо недоступных watercolor/photo layers; нет GPA/обычных заявок/уведомлений/1С/solver/семестра/parity и неработающих действий. Сводка дня вычисляется только из текущего schedule API. Семь дней и реальные интервалы сохраняют #29. Mobile STAFF эталона не было — адаптация делегирована.

## Автоматизированная приёмка

Расширенный `tests/e2e/schedule.spec.ts` выполняется в standalone, Functions и VPS через тот же существующий auth/API, без test-only bypass:

- STAFF создаёт настоящие факультет/направление/группу/занятие; реальный409 пересечения сохраняет введённый title; выбор grid/list открывает inspector. Edit/cancel/delete видны студенту, group2 изолирована, group1 fixture возвращается после сценария.
- Реальная текущая пара и растущий progress; дата/неделя/7дней; автообновление отмены без document reload; время вуза при другой browser zone. Пять состояний времени и границы дополнительно покрывает существующий unit набор.
- Loading с удержанным настоящим API-read, error503 и повтор с настоящим API; нет фиктивного расписания вместо ошибки.
- Обе роли360/390/1280 без page overflow; на360/1280 увеличение root text до200% и keyboard focus. Reduced-motion включён в smoke; в CSS нет обязательных animation/transition. Mobile форма использует16px inputs и минимум44px buttons.
- Все три локальных WOFF и два SVG отвечают200 с корректным MIME; FontFaceSet загружает Literata roman/italic и Onest с Ё/ё. Точные cmap/OFL/hashes — inventory. Нет external font URL в CSS.
- Computed contrast ключевых видимых text/background пар не ниже4.5:1. Декоративные divider/рисунки не используются для текста/единственной индикации статуса. Это smoke, не полная сертификация WCAG. Контрольный расчёт sRGB: brand/white8.53, ink/paper13.24, brand/paper7.77, muted/white5.80, muted/paper5.28, brand/lavender6.64, error/white7.33. Control border/white3.60:1 — non-text contrast≥3.

Локально подтверждены:9unit,44PostgreSQL integration,11artifact-checker,7launch-helper,15VPS helper/config; standalone10E2E+604observed module resolutions, Functions11E2E+cold start+452resolutions, VPS10HTTPS E2E+реальные TLS/SCRAM/privilege negatives и encrypted backup/restore; обе сборки и runtime isolation. Lint/typecheck/docs/diff PASS; production audit0, полный13moderate dev. Remote3CI на точном SHA — в Draft PR, отдельно от локальных результатов. Старые screenshots #29 сохранены отдельно для сравнения; артефакты текущего CI доступны в Actions7дней. Изменений backend/Prisma/API/dependencies нет.

## Ручная проверка владельцем

1. Сверить композицию с каждым owner PNG и подтвердить собственные SVG/типографику. Проверить360/390/1280, длинные названия, keyboard Tab/Shift+Tab, видимый focus, native date/time inputs на целевых ОС; screenreader и полноценный WCAG audit ещё не выполнены.
2. STAFF: создать группу и занятие, выбрать tile, изменить время, проверить409/сохранение ввода, отменить/восстановить/удалить. На mobile выбор должен прокрутить к inspector и сфокусировать дисциплину.
3. STUDENT: только своя подтверждённая группа, сегодня/неделя, current/break/before/after/empty. После отзыва доступ закрыт сервером. Не вводить реальные ФИО/email/пароли.
4. Финальный B SVG не утверждён. Приложение не опубликовано; Vercel/Neon ingress/TLS/resume/РФ, VPS host/security gates и2app/8tools vendor-unfixed HIGH остаются отдельными pre-deploy NO-GO.

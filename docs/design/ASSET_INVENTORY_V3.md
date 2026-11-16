# Asset inventory — UI Issue #34

## Основание и статус

[Issue #34](https://github.com/bam-low/mgimo/issues/34), [утверждение v3](APPROVED_V3_IMPLEMENTATION.md), ручной merge PR #33 в main `e2872a93` проверен до начала ветки. Три PNG получены из [комментария владельца](https://github.com/bam-low/mgimo/issues/34#issuecomment-6694166687), просмотрены и сохранены без перекодирования. Временные подписанные GitHub URLs не сохраняются.

Уточнение владельца в чате 06.11.2026: отдельных оригинальных SVG/PNG нет; три PNG — визуальный эталон. Разрешены собственные SVG/CSS иконки/иллюстрации, стилистически близкие Figma, с локальным хранением и provenance. Отсутствие отдельных исходников больше не блокирует реализацию. Запрещено использовать screenshot целого экрана как UI. Figma direct GET повторно вернул CONNECT403; экспорта отдельных слоёв через Figma не было. Созданные ниже иллюстрации не выдаются за оригинальные экспорты. Отдельной принципиально невоспроизводимой иллюстрации, требующей owner export для данного MVP, не выявлено; визуальное утверждение остаётся за владельцем.

## Три исходных PNG

| Файл | Реальный размер | SHA256 |
| --- | --- | --- |
| [figma-staff-timetable-1-2.png](assets/figma-staff-timetable-1-2.png) | 1280×1405; 247238 bytes | `eab3a20dbaf4265443bb4b1b883cdcb7b8456808a76bb0a71e7cda4656015869` |
| [figma-student-desktop-1-910.png](assets/figma-student-desktop-1-910.png) | 1296×1362; 295191 bytes | `339d3386a37a7165ec4bbd7f11265dcb6f966fdfd78f62a70e4f115a8405b855` |
| [figma-student-mobile-1-689.png](assets/figma-student-mobile-1-689.png) | 414×1055; 101503 bytes | `6055a1d437f319d584b9c581f4854b159cad8230644d3b847b4b0190a71e581d` |

Student mobile node1:689: фактический attachment414×1055, в прежнем owner handoff414×1054. Один пиксель не исправлялся искусственным resize. QA360/390 — размеры приложения, не размеры PNG. Desktop student node1:910:1296×1362; STAFF node1:2:1280×1405. Эти три PNG хранятся только в docs, не используются в runtime. Исторические B, concept1 и styleboard не изменены.

## Локальные шрифты

Официальный источник: [Google Fonts, pinned revision](https://github.com/google/fonts/tree/86aced91de05cd4f96a06838124cca45be337b2b/ofl). Literata regular/italic из `ofl/literata`, Onest regular из `ofl/onest`, OFL1.1 рядом с файлами. Утверждённая пара заменяет исторические Newsreader/Plus Jakarta Sans; не загружается с CDN.

Проверка Python fontTools TTFont: объединение всех Unicode cmap, точные наборы `А–Яа–яЁё`, A–Z/a–z,0–9; **каждый из трёх TTF и конечных WOFF содержит66/66 русских,52/52 латинских,10/10 цифр**. Literata axes opsz7–72/wght200–900, отдельный настоящий italic; Onest wght100–900, official italic отсутствует. Onest не наклоняется искусственно: font-synthesis:none; italic display использует Literata-Italic.

Исходные TTF hashes:

- Literata roman955132bytes: `b41138c9373112f32abb589cc22e8674b06ed4048b0c513be922bdd26f274440`.
- Literata italic902728bytes: `d483dfaeba9cbf4ce71d32a52ee65df82f7e35b15fff8d1011cdb242d1fcd465`.
- Onest roman193056bytes: `966c5c29b4755da84b6854d5c21dd4eaa2420225d0e9874de602de176d4a9f31`.

Для поставки TTFont(flavor='woff').save преобразует только контейнер/zlib, без subsetting/изменения glyph/имён/осей. WOFF1 выбран без добавления Brotli и зависимостей проекта. Исходные TTF доступны по pinned source; конечные файлы и лицензии в Git (у локальных OFL удалён только trailing space строки21; юридический текст сохранён):

| Файл | Bytes | SHA256 |
| --- | --- | --- |
| [OFL-literata.txt](../../public/fonts/OFL-literata.txt) | 4388 | `72ef68216a08669b2a977fe788a4aea6114636adbbe0bc6aa9192f63f8d400d0` |
| [OFL-onest.txt](../../public/fonts/OFL-onest.txt) | 4383 | `7805ccc507e6dc0c0796f1afa4f03ad413a9d302a30a24f8dbeb1aeef07a6c17` |
| [literata-italic.woff](../../public/fonts/literata-italic.woff) | 500700 | `7be141601929bf94ae20817c0c5429473b3490eeedd0b373b4eef51b2c52cb36` |
| [literata-roman.woff](../../public/fonts/literata-roman.woff) | 510904 | `e5872f8df689ec420ea0f92927060fd15f2296c130d770a8d925f9129b036513` |
| [onest-roman.woff](../../public/fonts/onest-roman.woff) | 108028 | `b688269b4fea4960e1b421c2389c8f63598771e27bb5b637d33f8491958054e0` |

WOFF total≈1.12MB — осознанный компромисс сохранения полного набора, variable axes и локальной загрузки. font-display:swap; браузер загружает только используемые faces. E2E явно загружает все три, проверяет FontFaceSet и HTTP200/MIME во всех runtime-путях. Наличие кириллицы подтверждено cmap, не только названием family в CSS.

## Созданная графика

| Файл | Происхождение / способ | Назначение |
| --- | --- | --- |
| [campus-garden.svg](../../public/design/campus-garden.svg) | Собственная векторная композиция Codex: храм/купол/деревья геометрическими path/rect/ellipse. Вдохновлена композицией owner PNG, без tracing или сторонней фотографии | Декоративный кампус в приветствии/aside,440×210viewBox |
| [study-desk.svg](../../public/design/study-desk.svg) | Собственный SVG из геометрических фигур: книги/экран/стол, без сторонней фотографии | Маленькая иллюстрация текущей пары,180×150viewBox |
| [ui-icon.tsx](../../src/app/ui-icon.tsx) | Собственные inlineSVG геометрии,15 значков, без icon package | Навигация/место/время/действия; aria-hidden, название у ссылки/кнопки |

Декоративный building icon не является финальным логотипом B; старые исходники B сохранены. Все SVG локальны, без remote href, скриптов и внешних ресурсов, декоративные изображения имеют пустой alt. Конкретные собственные рисунки подлежат owner review. Право использовать owner-generated макеты в MVP подтверждено владельцем; происхождение не объявляется сторонней юридической экспертизой.

## Визуальная сверка и намеренные различия

Сохранены кремовый canvas, светлые карточки, редакционные заголовки, burgundy только для действий/состояния, lavender accents, desktop sidebar, mobile bottom nav, двухколоночная student-композиция, STAFF week grid + inspector. Собственные SVG проще watercolor/фото референса. Literata/Onest дают другие метрики; длинные реальные названия переносятся, не заменяются фиктивными.

В MVP нет GPA, рейтинга, обычных заявок, уведомлений, online lecture,1С, semester/parity, teacher/room directories,solver/export. Эти reference-only элементы не превращены в dead links или выдуманные данные. Вместо них только реальное расписание, профиль и рассчитанная по существующему API сводка дня. Семь дней сохраняют контракт #29. STAFF mobile — делегированная адаптация: читаемый список дней, выбор занятия и тот же inspector с клавиатурным фокусом; все существующие операции остаются доступными.

[Реальные screenshots и сравнение](../screenshots/issue-34/README.md). Итоговая visual fidelity — ручное ревью, не заявленная pixel-perfect идентичность.

## Дополнение #59 — самостоятельная архитектурная иллюстрация

`public/design/campus-watercolor.png` — оригинальный image_gen asset по текстовому описанию неоклассического здания и акварельной листвы,16.11.2026; владелец разрешил новую иллюстрацию в чате. Не копия/crop DOCX, не фотография реального вуза, не новый логотип. Изображение декоративное, тексты/CTA — DOM. [Контекст и отличия](STUDENT_POLISH_59.md). Четыре исходных screenshot references владельца сохранены отдельно в gallery/references; они не используются в app assets. Фактические SHA исходных UI-файлов/PNG и параметры кадров — [галерея](../screenshots/issue-59/README.md).

const COURSE_STORAGE_KEY = "ipl-course-progress-v2";

function todayKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
}

function emptyProgress() {
    return {
        completed: {},
        scores: {},
        best: {},
        days: {},
        mistakes: {},
        examPassed: false
    };
}

function loadCourseProgress() {
    try {
        const raw = localStorage.getItem(COURSE_STORAGE_KEY);
        if (!raw) {
            return emptyProgress();
        }
        const parsed = JSON.parse(raw);
        return {
            completed: parsed.completed && typeof parsed.completed === "object" ? parsed.completed : {},
            scores: parsed.scores && typeof parsed.scores === "object" ? parsed.scores : {},
            best: parsed.best && typeof parsed.best === "object" ? parsed.best : {},
            days: parsed.days && typeof parsed.days === "object" ? parsed.days : {},
            mistakes: parsed.mistakes && typeof parsed.mistakes === "object" ? parsed.mistakes : {},
            examPassed: Boolean(parsed.examPassed)
        };
    } catch (error) {
        console.error(error);
        return emptyProgress();
    }
}

function saveCourseProgress(progress) {
    localStorage.setItem(COURSE_STORAGE_KEY, JSON.stringify(progress));
}

function isModuleUnlocked(modules, index, progress) {
    if (index === 0) {
        return true;
    }
    return Boolean(progress.completed[modules[index - 1].id]);
}

function buildQuestionIndex(course) {
    const map = new Map();
    course.modules.forEach((module) => {
        module.questions.forEach((question) => {
            map.set(question.id, { ...question, moduleId: module.id, moduleTitle: module.title });
        });
    });
    return map;
}

function formatDayLabel(isoDay) {
    const parsed = Date.parse(`${isoDay}T12:00:00`);
    if (Number.isNaN(parsed)) {
        return isoDay;
    }
    return new Date(parsed).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit"
    });
}

function lastDays(count) {
    const days = [];
    const cursor = new Date();
    for (let i = count - 1; i >= 0; i -= 1) {
        const date = new Date(cursor);
        date.setDate(cursor.getDate() - i);
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        days.push(`${date.getFullYear()}-${month}-${day}`);
    }
    return days;
}

function createCourseApp(root, course) {
    const passPercent = Number(course.passPercent) || 70;
    const examConfig = course.exam || null;
    const examPassPercent = Number(examConfig?.passPercent) || 80;
    const questionIndex = buildQuestionIndex(course);

    let progress = loadCourseProgress();
    let view = { type: "hub" };
    let quizState = null;
    const now = new Date();
    let calendarYear = now.getFullYear();
    let calendarMonth = now.getMonth(); // 0-11

    const MONTH_NAMES = [
        "Январь",
        "Февраль",
        "Март",
        "Апрель",
        "Май",
        "Июнь",
        "Июль",
        "Август",
        "Сентябрь",
        "Октябрь",
        "Ноябрь",
        "Декабрь"
    ];

    function setProgress(next) {
        progress = next;
        saveCourseProgress(progress);
    }

    function goHub() {
        view = { type: "hub" };
        quizState = null;
        render();
    }

    function completedCount() {
        return course.modules.filter((module) => progress.completed[module.id]).length;
    }

    function allModulesDone() {
        return completedCount() === course.modules.length;
    }

    function mistakeEntries() {
        return Object.entries(progress.mistakes)
            .map(([id, meta]) => {
                const question = questionIndex.get(id);
                if (!question) {
                    return null;
                }
                return { id, meta, question };
            })
            .filter(Boolean);
    }

    function openModule(moduleId) {
        const index = course.modules.findIndex((module) => module.id === moduleId);
        if (index < 0 || !isModuleUnlocked(course.modules, index, progress)) {
            return;
        }
        view = { type: "module", moduleId };
        quizState = null;
        render();
    }

    function openExamIntro() {
        if (!examConfig || !allModulesDone()) {
            return;
        }
        view = { type: "exam-intro" };
        quizState = null;
        render();
    }

    function startQuizSession({ mode, moduleId = "", title, questions, passThreshold }) {
        if (!questions.length) {
            return;
        }
        quizState = {
            mode,
            moduleId,
            title,
            questions,
            passThreshold,
            index: 0,
            answers: Array(questions.length).fill(null),
            revealed: false
        };
        view = { type: "quiz" };
        render();
    }

    function startModuleQuiz(moduleId) {
        const module = course.modules.find((item) => item.id === moduleId);
        if (!module) {
            return;
        }
        startQuizSession({
            mode: "module",
            moduleId,
            title: module.title,
            questions: module.questions.map((question) => ({
                ...question,
                moduleId: module.id,
                moduleTitle: module.title
            })),
            passThreshold: passPercent
        });
    }

    function startExam() {
        if (!examConfig || !allModulesDone()) {
            return;
        }
        const questions = (examConfig.questionIds || [])
            .map((id) => questionIndex.get(id))
            .filter(Boolean);
        startQuizSession({
            mode: "exam",
            moduleId: examConfig.id || "exam",
            title: examConfig.title,
            questions,
            passThreshold: examPassPercent
        });
    }

    function startMistakesReview() {
        const questions = mistakeEntries().map((entry) => entry.question);
        if (!questions.length) {
            showToastSafe("Пока нет ошибок для повтора");
            return;
        }
        startQuizSession({
            mode: "mistakes",
            moduleId: "mistakes",
            title: "Повтор ошибок",
            questions,
            passThreshold: 100
        });
    }

    function showToastSafe(text) {
    window.alert(text);
}

    function selectOption(optionIndex) {
        if (!quizState || quizState.revealed) {
            return;
        }
        quizState.answers[quizState.index] = optionIndex;
        quizState.revealed = true;
        render();
    }

    function nextQuestion() {
        if (!quizState) {
            return;
        }
        if (quizState.index < quizState.questions.length - 1) {
            quizState.index += 1;
            quizState.revealed = quizState.answers[quizState.index] !== null;
            render();
            return;
        }
        finishQuiz();
    }

    function recordDayStats({ correct, total, percent }) {
        const key = todayKey();
        const prev = progress.days[key] || {
            attempts: 0,
            correct: 0,
            total: 0,
            bestPercent: 0
        };
        return {
            ...progress.days,
            [key]: {
                attempts: prev.attempts + 1,
                correct: prev.correct + correct,
                total: prev.total + total,
                bestPercent: Math.max(prev.bestPercent || 0, percent)
            }
        };
    }

    function updateBest(scopeId, result) {
        const prev = progress.best[scopeId];
        if (!prev || result.percent > prev.percent) {
            return {
                ...progress.best,
                [scopeId]: result
            };
        }
        return progress.best;
    }

    function updateMistakes(questions, answers) {
        const nextMistakes = { ...progress.mistakes };
        questions.forEach((question, index) => {
            const selected = answers[index];
            const isCorrect = selected === question.answer;
            if (!isCorrect) {
                const prev = nextMistakes[question.id] || { wrongCount: 0 };
                nextMistakes[question.id] = {
                    moduleId: question.moduleId,
                    wrongCount: (prev.wrongCount || 0) + 1,
                    lastWrongAt: new Date().toISOString(),
                    lastSelected: selected
                };
                return;
            }
            if (nextMistakes[question.id]) {
                delete nextMistakes[question.id];
            }
        });
        return nextMistakes;
    }

    function finishQuiz() {
        const { questions, answers, mode, moduleId, passThreshold, title } = quizState;
        let correct = 0;
        questions.forEach((question, index) => {
            if (answers[index] === question.answer) {
                correct += 1;
            }
        });
        const total = questions.length;
        const percent = Math.round((correct / total) * 100);
        const passed = percent >= passThreshold;
        const result = {
            correct,
            total,
            percent,
            passed,
            at: new Date().toISOString()
        };

        const nextProgress = {
            ...progress,
            completed: { ...progress.completed },
            scores: { ...progress.scores },
            days: recordDayStats(result),
            best: updateBest(moduleId, result),
            mistakes: updateMistakes(questions, answers),
            examPassed: progress.examPassed
        };

        if (mode === "module" && passed) {
            nextProgress.completed[moduleId] = true;
            nextProgress.scores[moduleId] = result;
        }

        if (mode === "exam") {
            nextProgress.scores[moduleId] = result;
            if (passed) {
                nextProgress.examPassed = true;
            }
        }

        if (mode === "mistakes") {
            nextProgress.scores.mistakes = result;
        }

        setProgress(nextProgress);
        view = {
            type: "result",
            mode,
            moduleId,
            title,
            ...result,
            passThreshold
        };
        quizState = null;
        render();
    }

    function resetProgress() {
        setProgress(emptyProgress());
        goHub();
    }

    function renderModuleProgress() {
        return `
            <div class="course-module-progress">
                <div class="course-module-progress-head">
                    <h3>Результаты по модулям</h3>
                    <p class="muted">Показывается лучший процент каждого модуля</p>
                </div>
                <ul class="course-module-progress-list">
                    ${course.modules
                        .map((module, index) => {
                            const unlocked = isModuleUnlocked(course.modules, index, progress);
                            const completed = Boolean(progress.completed[module.id]);
                            const best = progress.best[module.id];
                            const percent = Number(best?.percent) || 0;
                            const barWidth = unlocked ? Math.min(100, Math.max(0, percent)) : 0;
                            let status = "Не начат";
                            if (!unlocked) {
                                status = "Закрыт";
                            } else if (completed) {
                                status = `Сдан · ${percent}%`;
                            } else if (best) {
                                status = `Не сдан · лучший ${percent}%`;
                            }

                            return `
                                <li class="course-module-progress-item ${completed ? "is-done" : ""} ${unlocked ? "" : "is-locked"}">
                                    <div class="course-module-progress-row">
                                        <span>${index + 1}. ${escapeHtml(module.title)}</span>
                                        <strong>${unlocked ? (best ? `${percent}%` : "—") : "—"}</strong>
                                    </div>
                                    <div class="course-progress-track" aria-hidden="true">
                                        <span class="course-progress-fill" style="width:${barWidth}%"></span>
                                    </div>
                                    <p class="muted">${status}</p>
                                </li>
                            `;
                        })
                        .join("")}
                </ul>
            </div>
        `;
    }

    function monthKey(year, month, day) {
        const mm = String(month + 1).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        return `${year}-${mm}-${dd}`;
    }

    function daysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    function availableYears() {
        const years = new Set([now.getFullYear()]);
        Object.keys(progress.days || {}).forEach((key) => {
            const year = Number(String(key).slice(0, 4));
            if (Number.isFinite(year) && year >= 2020 && year <= now.getFullYear() + 1) {
                years.add(year);
            }
        });
        return Array.from(years).sort((a, b) => b - a);
    }

    function shiftCalendar(deltaMonths) {
        const cursor = new Date(calendarYear, calendarMonth + deltaMonths, 1);
        calendarYear = cursor.getFullYear();
        calendarMonth = cursor.getMonth();
        render();
    }

    function renderMonthHistory() {
        const totalDays = daysInMonth(calendarYear, calendarMonth);
        const years = availableYears();
        if (!years.includes(calendarYear)) {
            years.push(calendarYear);
            years.sort((a, b) => b - a);
        }
        const today = todayKey();
        let activeDays = 0;
        let monthBest = 0;

        const dayCells = Array.from({ length: totalDays }, (_, index) => {
            const day = index + 1;
            const key = monthKey(calendarYear, calendarMonth, day);
            const stats = progress.days[key];
            const best = Number(stats?.bestPercent) || 0;
            if (best > 0) {
                activeDays += 1;
                monthBest = Math.max(monthBest, best);
            }
            const height = best > 0 ? Math.max(10, best) : 0;
            return `
                <div class="course-cal-day ${key === today ? "is-today" : ""} ${best ? "has-score" : ""}" title="${best ? `${best}%` : "нет попыток"}">
                    <span class="course-cal-num">${day}</span>
                    <span class="course-cal-bar-wrap">
                        ${best ? `<span class="course-cal-bar" style="height:${height}%"></span>` : ""}
                    </span>
                    <strong>${best ? `${best}%` : "·"}</strong>
                </div>
            `;
        }).join("");

        return `
            <div class="course-month-history">
                <div class="course-module-progress-head">
                    <h3>История по дням</h3>
                    <p class="muted">Выберите месяц и год. Высота — лучший % за день</p>
                </div>
                <div class="course-cal-controls">
                    <button type="button" class="btn course-cal-nav" data-course-action="cal-prev" aria-label="Предыдущий месяц">←</button>
                    <label class="course-cal-select">
                        <span class="visually-hidden">Месяц</span>
                        <select data-course-action="cal-month">
                            ${MONTH_NAMES.map(
                                (name, index) =>
                                    `<option value="${index}" ${index === calendarMonth ? "selected" : ""}>${name}</option>`
                            ).join("")}
                        </select>
                    </label>
                    <label class="course-cal-select">
                        <span class="visually-hidden">Год</span>
                        <select data-course-action="cal-year">
                            ${years
                                .map(
                                    (year) =>
                                        `<option value="${year}" ${year === calendarYear ? "selected" : ""}>${year}</option>`
                                )
                                .join("")}
                        </select>
                    </label>
                    <button type="button" class="btn course-cal-nav" data-course-action="cal-next" aria-label="Следующий месяц">→</button>
                </div>
                <p class="muted course-cal-summary">
                    ${MONTH_NAMES[calendarMonth]} ${calendarYear}:
                    ${activeDays ? `${activeDays} дн. · лучший ${monthBest}%` : "пока нет попыток"}
                </p>
                <div class="course-cal-grid">${dayCells}</div>
            </div>
        `;
    }

    function renderStatsStrip() {
        const done = completedCount();
        const moduleBests = course.modules
            .map((module) => progress.best[module.id]?.percent)
            .filter((value) => Number.isFinite(value));
        const avgBest = moduleBests.length
            ? Math.round(moduleBests.reduce((sum, value) => sum + value, 0) / moduleBests.length)
            : null;
        const examBest = progress.best[examConfig?.id || "exam"]?.percent;
        const mistakesCount = mistakeEntries().length;

        return `
            <div class="course-stats-grid">
                <div class="course-stat">
                    <span class="course-stat-label">Модули</span>
                    <strong>${done}/${course.modules.length}</strong>
                    <span class="muted">${done ? "сдано" : "ещё не сдавали"}</span>
                </div>
                <div class="course-stat">
                    <span class="course-stat-label">Средний лучший</span>
                    <strong>${avgBest != null ? `${avgBest}%` : "—"}</strong>
                    <span class="muted">по пройденным тестам</span>
                </div>
                <div class="course-stat">
                    <span class="course-stat-label">Экзамен</span>
                    <strong>${examBest != null ? `${examBest}%` : "—"}</strong>
                    <span class="muted">${progress.examPassed ? "сдан" : "не сдан"}</span>
                </div>
                <div class="course-stat">
                    <span class="course-stat-label">Ошибки</span>
                    <strong>${mistakesCount}</strong>
                    <span class="muted">в очереди на повтор</span>
                </div>
            </div>
        `;
    }

    function renderHub() {
        const done = completedCount();
        const allDone = allModulesDone();
        const mistakesCount = mistakeEntries().length;
        const examBest = progress.best[examConfig?.id || "exam"];

        return `
            <section class="page-header page-header-image">
                <div class="container">
                    <p class="section-kicker">Обучение</p>
                    <h1>${escapeHtml(course.title)}</h1>
                    <p class="section-text">${escapeHtml(course.subtitle)}</p>
                </div>
            </section>

            <section class="page-content">
                <div class="container course-summary">
                    <div class="course-summary-card">
                        <p class="course-summary-label">Прогресс курса</p>
                        <p class="course-summary-value">${done} из ${course.modules.length} модулей</p>
                        <div class="course-progress-track" aria-hidden="true">
                            <span class="course-progress-fill" style="width:${(done / course.modules.length) * 100}%"></span>
                        </div>
                        <p class="muted">Зачёт модуля — от ${passPercent}%. Экзамен — от ${examPassPercent}% после всех модулей.</p>
                        ${progress.examPassed ? `<p class="course-badge">Финальный экзамен сдан</p>` : ""}
                        ${renderStatsStrip()}
                        ${renderModuleProgress()}
                        ${renderMonthHistory()}
                        ${renderAbbreviations()}
                        <button type="button" class="btn course-reset" data-course-action="reset">Сбросить прогресс</button>
                    </div>
                </div>

                <div class="container course-modules">
                    ${course.modules
                        .map((module, index) => {
                            const unlocked = isModuleUnlocked(course.modules, index, progress);
                            const score = progress.scores[module.id];
                            const best = progress.best[module.id];
                            const completed = Boolean(progress.completed[module.id]);
                            const status = !unlocked
                                ? "Закрыт"
                                : completed
                                  ? `Сдан · ${score?.percent ?? best?.percent ?? 0}%`
                                  : score
                                    ? `Не сдан · ${score.percent}%`
                                    : "Доступен";

                            return `
                                <article class="course-module-card ${unlocked ? "" : "is-locked"} ${completed ? "is-done" : ""}">
                                    <div class="course-module-top">
                                        <span class="course-module-index">Модуль ${index + 1}</span>
                                        <span class="course-module-status">${status}</span>
                                    </div>
                                    <h2>${escapeHtml(module.title)}</h2>
                                    <p>${escapeHtml(module.subtitle)}</p>
                                    <p class="muted">${module.questions.length} вопросов${best ? ` · лучший ${best.percent}%` : ""}</p>
                                    <button
                                        type="button"
                                        class="btn primary"
                                        data-course-action="open-module"
                                        data-module-id="${escapeAttr(module.id)}"
                                        ${unlocked ? "" : "disabled"}
                                    >${completed ? "Повторить" : unlocked ? "Открыть" : "Закрыто"}</button>
                                </article>
                            `;
                        })
                        .join("")}

                    <article class="course-module-card course-special-card ${mistakesCount ? "" : "is-locked"}">
                        <div class="course-module-top">
                            <span class="course-module-index">Практика</span>
                            <span class="course-module-status">${mistakesCount ? `${mistakesCount} шт.` : "Пусто"}</span>
                        </div>
                        <h2>Повтор ошибок</h2>
                        <p>Только вопросы, в которых были ошибки. Верный ответ убирает вопрос из списка.</p>
                        <p class="muted">Цель — закрыть все ошибки</p>
                        <button
                            type="button"
                            class="btn primary"
                            data-course-action="start-mistakes"
                            ${mistakesCount ? "" : "disabled"}
                        >${mistakesCount ? "Повторить ошибки" : "Пока нет ошибок"}</button>
                    </article>

                    ${
                        examConfig
                            ? `<article class="course-module-card course-exam-card ${allDone ? "" : "is-locked"} ${progress.examPassed ? "is-done" : ""}">
                                <div class="course-module-top">
                                    <span class="course-module-index">Итог</span>
                                    <span class="course-module-status">${
                                        !allDone
                                            ? "Закрыт"
                                            : progress.examPassed
                                              ? `Сдан · ${examBest?.percent ?? 0}%`
                                              : examBest
                                                ? `Лучший ${examBest.percent}%`
                                                : "Доступен"
                                    }</span>
                                </div>
                                <h2>${escapeHtml(examConfig.title)}</h2>
                                <p>${escapeHtml(examConfig.subtitle)}</p>
                                <p class="muted">${(examConfig.questionIds || []).length} вопросов · порог ${examPassPercent}%</p>
                                <button
                                    type="button"
                                    class="btn primary"
                                    data-course-action="open-exam"
                                    ${allDone ? "" : "disabled"}
                                >${progress.examPassed ? "Пройти снова" : allDone ? "К экзамену" : "Сдайте все модули"}</button>
                            </article>`
                            : ""
                    }
                </div>
            </section>
        `;
    }

    function devicesByIds(ids) {
        const all = Array.isArray(course.devices) ? course.devices : [];
        if (!Array.isArray(ids) || !ids.length) {
            return [];
        }
        const map = new Map(all.map((device) => [device.id, device]));
        return ids.map((id) => map.get(id)).filter(Boolean);
    }

    function renderAbbreviations() {
        const items = Array.isArray(course.abbreviations) ? course.abbreviations : [];
        if (!items.length) {
            return "";
        }
        return `
            <div class="course-abbr-block">
                <h3>Сокращения</h3>
                <ul class="course-abbr-list">
                    ${items
                        .map(
                            (item) => `
                        <li>
                            <strong>${escapeHtml(item.short)}</strong>
                            <span>${escapeHtml(item.full)}</span>
                        </li>`
                        )
                        .join("")}
                </ul>
            </div>
        `;
    }

    function renderDeviceGlossary(devices, title = "Приборы и расшифровки") {
        if (!devices.length) {
            return "";
        }
        return `
            <div class="course-devices">
                <h2>${escapeHtml(title)}</h2>
                <ul class="course-device-list">
                    ${devices
                        .map(
                            (device) => `
                        <li class="course-device-item">
                            <div class="course-device-head">
                                <strong>${escapeHtml(device.short)}</strong>
                                <span>${escapeHtml(device.name)}</span>
                            </div>
                            <p class="course-device-decipher">${escapeHtml(device.decipher || "")}</p>
                            <p class="muted">${escapeHtml(device.purpose || "")}</p>
                        </li>`
                        )
                        .join("")}
                </ul>
            </div>
        `;
    }

    function renderModuleIntro(module, index) {
        const best = progress.best[module.id];
        const moduleDevices = devicesByIds(module.deviceIds);
        const showAbbr = index === 0 || module.id === "instruments" || module.id === "order";
        return `
            <section class="page-header">
                <div class="container">
                    <p class="section-kicker">Модуль ${index + 1}</p>
                    <h1>${escapeHtml(module.title)}</h1>
                    <p class="section-text">${escapeHtml(module.subtitle)}</p>
                </div>
            </section>
            <section class="page-content">
                <div class="container course-panel">
                    <h2>Материал модуля</h2>
                    <ul class="course-theory-list">
                        ${(module.theory || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                    </ul>
                    ${renderDeviceGlossary(moduleDevices)}
                    ${showAbbr ? renderAbbreviations() : ""}
                    ${best ? `<p class="muted">Ваш лучший результат: <strong>${best.percent}%</strong></p>` : ""}
                    <div class="course-actions">
                        <button type="button" class="btn" data-course-action="hub">К списку модулей</button>
                        <button type="button" class="btn primary" data-course-action="start-quiz" data-module-id="${escapeAttr(module.id)}">Начать тест</button>
                    </div>
                </div>
            </section>
        `;
    }

    function renderExamIntro() {
        const best = progress.best[examConfig.id || "exam"];
        return `
            <section class="page-header">
                <div class="container">
                    <p class="section-kicker">Итоговая проверка</p>
                    <h1>${escapeHtml(examConfig.title)}</h1>
                    <p class="section-text">${escapeHtml(examConfig.subtitle)}</p>
                </div>
            </section>
            <section class="page-content">
                <div class="container course-panel">
                    <h2>Перед экзаменом</h2>
                    <ul class="course-theory-list">
                        ${(examConfig.theory || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                    </ul>
                    ${best ? `<p class="muted">Лучший результат экзамена: <strong>${best.percent}%</strong></p>` : ""}
                    <div class="course-actions">
                        <button type="button" class="btn" data-course-action="hub">Назад</button>
                        <button type="button" class="btn primary" data-course-action="start-exam">Начать экзамен</button>
                    </div>
                </div>
            </section>
        `;
    }

    function renderQuiz() {
        const question = quizState.questions[quizState.index];
        const selected = quizState.answers[quizState.index];
        const revealed = quizState.revealed;
        const isCorrect = selected === question.answer;
        const step = quizState.index + 1;
        const total = quizState.questions.length;
        const modeLabel =
            quizState.mode === "exam"
                ? "Экзамен"
                : quizState.mode === "mistakes"
                  ? "Повтор ошибок"
                  : "Модуль";

        return `
            <section class="page-header">
                <div class="container">
                    <p class="section-kicker">${modeLabel} · вопрос ${step} из ${total}</p>
                    <h1>${escapeHtml(quizState.title)}</h1>
                    ${
                        quizState.mode !== "module" && question.moduleTitle
                            ? `<p class="section-text">Тема: ${escapeHtml(question.moduleTitle)}</p>`
                            : ""
                    }
                </div>
            </section>
            <section class="page-content">
                <div class="container course-panel">
                    <div class="course-progress-track" aria-hidden="true">
                        <span class="course-progress-fill" style="width:${(step / total) * 100}%"></span>
                    </div>
                    <h2 class="course-question">${escapeHtml(question.text)}</h2>
                    <div class="course-options" role="group" aria-label="Варианты ответа">
                        ${question.options
                            .map((option, optionIndex) => {
                                let className = "course-option";
                                if (revealed && optionIndex === question.answer) {
                                    className += " is-correct";
                                }
                                if (revealed && optionIndex === selected && optionIndex !== question.answer) {
                                    className += " is-wrong";
                                }
                                if (!revealed && optionIndex === selected) {
                                    className += " is-selected";
                                }
                                return `
                                    <button
                                        type="button"
                                        class="${className}"
                                        data-course-action="select-option"
                                        data-option-index="${optionIndex}"
                                        ${revealed ? "disabled" : ""}
                                    >${escapeHtml(option)}</button>
                                `;
                            })
                            .join("")}
                    </div>
                    ${
                        revealed
                            ? `<div class="course-explain ${isCorrect ? "is-ok" : "is-bad"}">
                                <strong>${isCorrect ? "Верно" : "Неверно"}.</strong>
                                <p>${escapeHtml(question.explain)}</p>
                               </div>
                               <div class="course-actions">
                                 <button type="button" class="btn primary" data-course-action="next-question">
                                   ${step === total ? "Завершить" : "Следующий вопрос"}
                                 </button>
                               </div>`
                            : ""
                    }
                </div>
            </section>
        `;
    }

    function renderResult() {
        const isExam = view.mode === "exam";
        const isMistakes = view.mode === "mistakes";
        const remainingMistakes = mistakeEntries().length;
        const nextModuleIndex = course.modules.findIndex((item) => item.id === view.moduleId);
        const next = nextModuleIndex >= 0 ? course.modules[nextModuleIndex + 1] : null;
        const best = progress.best[view.moduleId];

        return `
            <section class="page-header">
                <div class="container">
                    <p class="section-kicker">Результат</p>
                    <h1>${escapeHtml(view.title)}</h1>
                </div>
            </section>
            <section class="page-content">
                <div class="container course-panel course-result">
                    <p class="course-result-score">${view.percent}%</p>
                    <p>${view.correct} из ${view.total} верных ответов</p>
                    <p class="muted">Лучший результат здесь: ${best ? `${best.percent}%` : `${view.percent}%`}</p>
                    <p class="course-badge ${view.passed ? "" : "is-fail"}">
                        ${
                            isMistakes
                                ? view.passed
                                    ? "Все выбранные ошибки закрыты"
                                    : `Осталось ошибок в банке: ${remainingMistakes}`
                                : view.passed
                                  ? isExam
                                    ? "Экзамен сдан"
                                    : "Модуль сдан"
                                  : `Нужно не менее ${view.passThreshold}%`
                        }
                    </p>
                    <div class="course-actions">
                        <button type="button" class="btn" data-course-action="hub">К списку модулей</button>
                        ${
                            view.mode === "module"
                                ? `<button type="button" class="btn" data-course-action="open-module" data-module-id="${escapeAttr(view.moduleId)}">К теории</button>
                                   <button type="button" class="btn primary" data-course-action="start-quiz" data-module-id="${escapeAttr(view.moduleId)}">Пройти снова</button>`
                                : ""
                        }
                        ${
                            isExam
                                ? `<button type="button" class="btn primary" data-course-action="start-exam">Пройти экзамен снова</button>`
                                : ""
                        }
                        ${
                            isMistakes && remainingMistakes
                                ? `<button type="button" class="btn primary" data-course-action="start-mistakes">Ещё раз ошибки</button>`
                                : ""
                        }
                        ${
                            view.mode === "module" && view.passed && next
                                ? `<button type="button" class="btn primary" data-course-action="open-module" data-module-id="${escapeAttr(next.id)}">Следующий модуль</button>`
                                : ""
                        }
                        ${
                            view.mode === "module" && view.passed && !next && allModulesDone()
                                ? `<button type="button" class="btn primary" data-course-action="open-exam">К финальному экзамену</button>`
                                : ""
                        }
                        ${
                            remainingMistakes && !isMistakes
                                ? `<button type="button" class="btn" data-course-action="start-mistakes">Повторить ошибки (${remainingMistakes})</button>`
                                : ""
                        }
                    </div>
                </div>
            </section>
        `;
    }

    function render() {
        if (view.type === "hub") {
            root.innerHTML = renderHub();
            return;
        }

        if (view.type === "exam-intro") {
            root.innerHTML = renderExamIntro();
            return;
        }

        if (view.type === "quiz") {
            root.innerHTML = renderQuiz();
            return;
        }

        if (view.type === "result") {
            root.innerHTML = renderResult();
            return;
        }

        if (view.type === "module") {
            const module = course.modules.find((item) => item.id === view.moduleId);
            const index = course.modules.findIndex((item) => item.id === view.moduleId);
            if (!module || index < 0) {
                goHub();
                return;
            }
            root.innerHTML = renderModuleIntro(module, index);
        }
    }

    root.addEventListener("click", (event) => {
        const trigger = event.target.closest("[data-course-action]");
        if (!trigger || trigger.tagName === "SELECT" || trigger.tagName === "OPTION") {
            return;
        }

        const action = trigger.dataset.courseAction;

        if (action === "hub") {
            goHub();
            return;
        }

        if (action === "reset") {
            if (window.confirm("Сбросить весь прогресс курса, экзамен и ошибки?")) {
                resetProgress();
            }
            return;
        }

        if (action === "cal-prev") {
            shiftCalendar(-1);
            return;
        }

        if (action === "cal-next") {
            shiftCalendar(1);
            return;
        }

        if (action === "open-module") {
            openModule(trigger.dataset.moduleId);
            return;
        }

        if (action === "start-quiz") {
            startModuleQuiz(trigger.dataset.moduleId);
            return;
        }

        if (action === "open-exam") {
            openExamIntro();
            return;
        }

        if (action === "start-exam") {
            startExam();
            return;
        }

        if (action === "start-mistakes") {
            startMistakesReview();
            return;
        }

        if (action === "select-option") {
            selectOption(Number(trigger.dataset.optionIndex));
            return;
        }

        if (action === "next-question") {
            nextQuestion();
        }
    });

    root.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) {
            return;
        }
        const action = target.dataset.courseAction;
        if (action === "cal-month") {
            calendarMonth = Number(target.value) || 0;
            render();
            return;
        }
        if (action === "cal-year") {
            calendarYear = Number(target.value) || now.getFullYear();
            render();
        }
    });

    render();
}

async function initCoursePage() {
    const root = document.querySelector("#course-app");
    if (!root) {
        return;
    }

    try {
        const course = await fetchJson(resolvePath("data/course.json"));
        if (!course || !Array.isArray(course.modules) || course.modules.length === 0) {
            throw new Error("Course data is empty");
        }
        createCourseApp(root, course);
    } catch (error) {
        root.innerHTML = `
            <section class="page-content">
                <div class="container">
                    <article class="card">
                        <h3>Курс временно недоступен</h3>
                        <p>Не удалось загрузить учебные материалы. Обновите страницу или обратитесь к администратору сайта.</p>
                    </article>
                </div>
            </section>
        `;
        console.error(error);
    }
}

initCoursePage();

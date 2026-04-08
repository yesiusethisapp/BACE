// =================================================================
// 0. Configuration
// =================================================================

const SHEET_API_URL =
	"https://script.google.com/macros/s/AKfycbwbImwdivb5lrsvwNjt_d2bnG63_0icTGg4QlUoR-nKH0FR5ZD-hkzA8t_vnCMzOmNJ/exec";
const QUESTIONS_PER_CATEGORY = 3;

const CATEGORY_MAP = [
	{ key: "TECHNICAL", name: "1. Technical Skills & Applications" },
	{ key: "SAFETY", name: "2. Safety & Workplace Culture" },
	{ key: "BIOCHEM", name: "3. Biochemistry & Molecular Biology" },
	{ key: "REGULATION", name: "4. Regulation & Quality" },
	{ key: "BIOTECH", name: "5. Biotechnology Skills" },
	{ key: "MATH", name: "6. Applied Mathematics" },
	{ key: "EQUIPMENT", name: "7. Standard Equipment" },
	{ key: "DATA", name: "8. Experimental & Data Analysis" },
];
const DIFFICULTY_LEVELS = ["EASY", "MEDIUM", "HARD"];

// Question format modes
const FORMAT_MODES = ["MCQ", "TRUE_FALSE", "FILL_BLANK", "MATCHING"];

// BACE Exam config
const BACE_CONFIG = {
	totalQuestions: 60,
	timeMinutes: 90,
	passingPct: 80,
	categories: CATEGORY_MAP.map((c) => c.key),
};

// State
let currentQuestionIndex = 0;
let score = 0;
let streak = 0;
let totalAnswered = 0;
let selectedOption = null;
let activeQuestions = [];
let allQuestionsFlat = [];
let answerLocked = false;
let currentMode = "STANDARD"; // STANDARD | BACE
let activeFormats = ["MCQ"]; // which formats are enabled
let baceTimerInterval = null;
let baceTimeLeft = 0;
let baceAnswers = {}; // { index: selectedKey }

// =================================================================
// KaTeX
// =================================================================
function renderElementMath(el) {
	if (typeof renderMathInElement === "function" && el) {
		renderMathInElement(el, {
			delimiters: [
				{ left: "$$", right: "$$", display: true },
				{ left: "$", right: "$", display: false },
			],
			trust: true,
		});
	}
}

// =================================================================
// 1. Fetch & Init
// =================================================================
async function fetchQuizData() {
	try {
		const res = await fetch(SHEET_API_URL);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const raw = await res.json();

		allQuestionsFlat = raw
			.map((item) => {
				const cat = CATEGORY_MAP.find((c) => c.key === item.CategoryKey) || {
					name: item.CategoryKey,
				};
				return {
					difficulty: item.Difficulty
						? item.Difficulty.toUpperCase()
						: "MEDIUM",
					question: item.Question,
					options: {
						A: item.OptionA,
						B: item.OptionB,
						C: item.OptionC,
						D: item.OptionD,
					},
					answer: item.Answer ? item.Answer.toUpperCase().trim() : "",
					explanation: item.Explanation || "No explanation provided.",
					categoryKey: item.CategoryKey,
					categoryName: cat.name,
					format: "MCQ", // base format from sheet
				};
			})
			.filter((q) => q.question && q.answer);

		if (!allQuestionsFlat.length)
			throw new Error("Sheet appears empty or headers are missing.");

		buildSetupUI();
	} catch (err) {
		document.getElementById("setup-area").innerHTML = `
            <h2 style="color:var(--danger)">Connection Error</h2>
            <p style="color:var(--text-muted);font-family:'Space Mono',monospace;font-size:.85rem">${err.message}</p>
            <p style="margin-top:12px;font-size:.85rem">Check the API URL and deployment settings.</p>`;
	}
}

function buildSetupUI() {
	const setup = document.getElementById("setup-area");
	setup.innerHTML = `
        <h2>Quiz Setup <span style="font-size:.75rem;color:var(--text-muted);font-family:'Space Mono',monospace;font-weight:400">${allQuestionsFlat.length} questions loaded</span></h2>

        <!-- Mode Toggle -->
        <div class="mode-toggle-row">
            <button class="mode-tab active" data-mode="STANDARD" onclick="switchModeTab(this)">⚗️ Standard Quiz</button>
            <button class="mode-tab" data-mode="BACE" onclick="switchModeTab(this)">🏛️ BACE Exam</button>
        </div>

        <!-- Standard Setup -->
        <div id="standard-setup">
            <div class="selection-container">
                <span class="section-label">Question Formats</span>
                <div class="checkbox-list" id="format-checkbox-list">
                    <label><input type="checkbox" value="MCQ" checked> Multiple Choice (A–D)</label>
                    <label><input type="checkbox" value="TRUE_FALSE"> True / False</label>
                    <label><input type="checkbox" value="FILL_BLANK"> Fill in the Blank</label>
                    <label><input type="checkbox" value="MATCHING"> Matching</label>
                </div>
            </div>
            <div class="selection-container">
                <span class="section-label">Difficulty</span>
                <div id="difficulty-checkbox-list" class="checkbox-list"></div>
            </div>
            <div class="selection-container">
                <span class="section-label">Categories — ${QUESTIONS_PER_CATEGORY} questions each</span>
                <div id="category-checkbox-list" class="checkbox-list"></div>
            </div>
            <div class="controls" style="margin-top:20px">
                <button id="start-btn">Start Quiz →</button>
            </div>
        </div>

        <!-- BACE Exam Setup -->
        <div id="bace-setup" style="display:none">
            <div class="bace-info-grid">
                <div class="bace-info-card">
                    <span class="bace-info-icon">📋</span>
                    <span class="bace-info-num">${BACE_CONFIG.totalQuestions}</span>
                    <span class="bace-info-label">Questions</span>
                </div>
                <div class="bace-info-card">
                    <span class="bace-info-icon">⏱️</span>
                    <span class="bace-info-num">${BACE_CONFIG.timeMinutes}</span>
                    <span class="bace-info-label">Minutes</span>
                </div>
                <div class="bace-info-card">
                    <span class="bace-info-icon">🎯</span>
                    <span class="bace-info-num">${BACE_CONFIG.passingPct}%</span>
                    <span class="bace-info-label">Pass Mark</span>
                </div>
                <div class="bace-info-card">
                    <span class="bace-info-icon">🔬</span>
                    <span class="bace-info-num">${CATEGORY_MAP.length}</span>
                    <span class="bace-info-label">Domains</span>
                </div>
            </div>
            <div class="bace-rules">
                <p class="bace-rule-title">📌 Exam Rules</p>
                <ul>
                    <li>All 8 knowledge domains are tested (~7–8 questions each)</li>
                    <li>Questions include MCQ, True/False, Fill-in-Blank & Matching formats</li>
                    <li>No feedback shown during exam — review at the end</li>
                    <li>Timer counts down; exam auto-submits when time expires</li>
                    <li>You may navigate back to change answers before submitting</li>
                </ul>
            </div>
            <div class="selection-container">
                <span class="section-label">Difficulty Mix</span>
                <div id="bace-difficulty-list" class="checkbox-list"></div>
            </div>
            <div class="controls" style="margin-top:20px">
                <button id="bace-start-btn" class="bace-start-btn">🏛️ Begin BACE Exam →</button>
            </div>
        </div>`;

	populateDifficultyCheckboxes(
		document.getElementById("difficulty-checkbox-list"),
	);
	populateCategoryCheckboxes(document.getElementById("category-checkbox-list"));
	populateDifficultyCheckboxes(document.getElementById("bace-difficulty-list"));

	document.getElementById("start-btn").addEventListener("click", startQuiz);
	document
		.getElementById("bace-start-btn")
		.addEventListener("click", startBACE);
	renderElementMath(setup);
}

// =================================================================
// Mode tab switching
// =================================================================
function switchModeTab(btn) {
	document
		.querySelectorAll(".mode-tab")
		.forEach((t) => t.classList.remove("active"));
	btn.classList.add("active");
	const mode = btn.dataset.mode;
	document.getElementById("standard-setup").style.display =
		mode === "STANDARD" ? "block" : "none";
	document.getElementById("bace-setup").style.display =
		mode === "BACE" ? "block" : "none";
	currentMode = mode;
}

// =================================================================
// 2. Setup Helpers
// =================================================================
function populateDifficultyCheckboxes(el) {
	el.innerHTML = "";
	addCheckbox(el, null, "EASY", "EASY", true);
	addCheckbox(el, null, "MEDIUM", "MEDIUM", true);
	addCheckbox(el, null, "HARD", "HARD", true);
}

function populateCategoryCheckboxes(el) {
	el.innerHTML = "";
	addCheckbox(
		el,
		"check-all-category",
		"ALL",
		`All Categories (${CATEGORY_MAP.length})`,
		true,
	);
	CATEGORY_MAP.forEach((c) => addCheckbox(el, null, c.key, c.name, true));
	el.querySelector("#check-all-category").addEventListener(
		"change",
		function () {
			el.querySelectorAll(
				"input[type=checkbox]:not(#check-all-category)",
			).forEach((c) => (c.checked = this.checked));
		},
	);
}

function addCheckbox(parent, id, value, labelText, checked) {
	const lbl = document.createElement("label");
	lbl.innerHTML = `<input type="checkbox" ${id ? `id="${id}"` : ""} value="${value}" ${checked ? "checked" : ""}> ${labelText}`;
	parent.appendChild(lbl);
}

function getCheckedValues(container) {
	return Array.from(
		container.querySelectorAll("input[type=checkbox]:checked"),
	).map((c) => c.value);
}

function shuffleArray(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

// =================================================================
// 3a. Format Transformation
// Transforms a base MCQ question into alternate formats
// =================================================================
function transformQuestionFormat(q, targetFormat) {
	if (targetFormat === "MCQ") return { ...q, format: "MCQ" };

	if (targetFormat === "TRUE_FALSE") {
		// Generate a true or false statement from the question
		const isTrue = Math.random() > 0.5;
		const correctKey = q.answer; // e.g. "A"
		const correctText = q.options[correctKey];
		let statement, tfAnswer;

		if (isTrue) {
			// Make a true statement using the correct answer
			statement = `True or False: In response to the question "${q.question}", the correct answer is: ${correctText}`;
			tfAnswer = "A"; // A = True
		} else {
			// Use a wrong option to make a false statement
			const wrongKeys = ["A", "B", "C", "D"].filter(
				(k) => k !== correctKey && q.options[k],
			);
			const wrongKey = wrongKeys[Math.floor(Math.random() * wrongKeys.length)];
			statement = `True or False: In response to the question "${q.question}", the correct answer is: ${q.options[wrongKey]}`;
			tfAnswer = "B"; // B = False
		}

		return {
			...q,
			format: "TRUE_FALSE",
			question: statement,
			options: { A: "True", B: "False" },
			answer: tfAnswer,
		};
	}

	if (targetFormat === "FILL_BLANK") {
		const correctKey = q.answer;
		const correctText = q.options[correctKey];
		// Replace the answer in the question text, or just show the question and ask them to type
		return {
			...q,
			format: "FILL_BLANK",
			fillAnswer: correctText,
			// options remain for hint checking
		};
	}

	if (targetFormat === "MATCHING") {
		// Build 4 pairs from all 4 options. The "question" becomes a matching stem.
		// We use a shuffled label list vs option content list
		const keys = ["A", "B", "C", "D"].filter((k) => q.options[k]);
		if (keys.length < 4) return { ...q, format: "MCQ" }; // fallback

		const labels = keys.map((k) => ({ key: k, text: q.options[k] }));
		const shuffledLabels = shuffleArray([...labels]);

		// Descriptions — here we use the question as context and the options as items
		// We'll pair letters 1-4 on left with shuffled answers on right
		return {
			...q,
			format: "MATCHING",
			matchItems: keys.map((k, i) => ({
				letter: String.fromCharCode(65 + i),
				key: k,
				text: q.options[k],
			})),
			matchShuffle: shuffledLabels,
			// Correct mapping: letter i -> shuffledLabels index where key matches
			matchAnswer: null, // evaluated dynamically
		};
	}

	return { ...q, format: "MCQ" };
}

function assignFormats(questions, enabledFormats) {
	if (!enabledFormats.length) enabledFormats = ["MCQ"];
	return questions.map((q) => {
		const fmt =
			enabledFormats[Math.floor(Math.random() * enabledFormats.length)];
		return transformQuestionFormat(q, fmt);
	});
}

// =================================================================
// 3b. Start Standard Quiz
// =================================================================
function startQuiz() {
	const selDiff = getCheckedValues(
		document.getElementById("difficulty-checkbox-list"),
	);
	const catEl = document.getElementById("category-checkbox-list");
	const allCatChecked = catEl.querySelector("#check-all-category")?.checked;
	const selCats = allCatChecked
		? ["ALL"]
		: getCheckedValues(catEl).filter((v) => v !== "ALL");
	const selFormats = getCheckedValues(
		document.getElementById("format-checkbox-list"),
	);

	if (!selDiff.length || (!selCats.length && !allCatChecked)) {
		showToast("Select at least one difficulty and category", false);
		return;
	}
	if (!selFormats.length) {
		showToast("Select at least one question format", false);
		return;
	}

	const filtered = allQuestionsFlat.filter(
		(q) =>
			selDiff.includes(q.difficulty) &&
			(selCats.includes("ALL") || selCats.includes(q.categoryKey)),
	);

	const byCategory = {};
	filtered.forEach((q) => {
		if (!byCategory[q.categoryKey]) byCategory[q.categoryKey] = [];
		byCategory[q.categoryKey].push(q);
	});

	activeQuestions = [];
	for (const key in byCategory) {
		activeQuestions.push(
			...shuffleArray(byCategory[key]).slice(0, QUESTIONS_PER_CATEGORY),
		);
	}
	activeQuestions = shuffleArray(activeQuestions);
	activeQuestions = assignFormats(activeQuestions, selFormats);

	if (!activeQuestions.length) {
		showToast("No questions match those filters", false);
		return;
	}

	currentMode = "STANDARD";
	currentQuestionIndex = 0;
	score = 0;
	streak = 0;
	totalAnswered = 0;

	document.getElementById("setup-area").style.display = "none";
	document.getElementById("quiz-area").style.display = "block";
	document.getElementById("hud-bar").classList.add("visible");
	document.getElementById("progress-wrap").classList.add("visible");

	loadQuestion();
}

// =================================================================
// 3c. Start BACE Exam
// =================================================================
function startBACE() {
	const selDiff = getCheckedValues(
		document.getElementById("bace-difficulty-list"),
	);
	if (!selDiff.length) {
		showToast("Select at least one difficulty", false);
		return;
	}

	const filtered = allQuestionsFlat.filter((q) =>
		selDiff.includes(q.difficulty),
	);

	if (filtered.length < BACE_CONFIG.totalQuestions) {
		showToast(
			`Need ${BACE_CONFIG.totalQuestions} questions, only ${filtered.length} match. Adjust filters.`,
			false,
		);
		return;
	}

	// Distribute evenly across categories
	const byCategory = {};
	filtered.forEach((q) => {
		if (!byCategory[q.categoryKey]) byCategory[q.categoryKey] = [];
		byCategory[q.categoryKey].push(q);
	});

	const cats = Object.keys(byCategory);
	const perCat = Math.ceil(BACE_CONFIG.totalQuestions / cats.length);
	activeQuestions = [];
	for (const key of cats) {
		activeQuestions.push(...shuffleArray(byCategory[key]).slice(0, perCat));
	}
	activeQuestions = shuffleArray(activeQuestions).slice(
		0,
		BACE_CONFIG.totalQuestions,
	);

	// Assign mixed formats
	activeQuestions = assignFormats(activeQuestions, [
		"MCQ",
		"TRUE_FALSE",
		"FILL_BLANK",
		"MATCHING",
	]);

	currentMode = "BACE";
	currentQuestionIndex = 0;
	baceAnswers = {};
	score = 0;
	streak = 0;
	totalAnswered = 0;

	baceTimeLeft = BACE_CONFIG.timeMinutes * 60;

	document.getElementById("setup-area").style.display = "none";
	document.getElementById("quiz-area").style.display = "block";
	document.getElementById("hud-bar").classList.add("visible");
	document.getElementById("progress-wrap").classList.add("visible");

	// Inject BACE nav panel
	injectBACENav();
	startBACETimer();
	loadQuestion();
}

// =================================================================
// BACE Timer
// =================================================================
function startBACETimer() {
	clearInterval(baceTimerInterval);
	baceTimerInterval = setInterval(() => {
		baceTimeLeft--;
		updateBACETimerDisplay();
		if (baceTimeLeft <= 0) {
			clearInterval(baceTimerInterval);
			showToast("⏰ Time's up! Submitting exam...", false);
			setTimeout(submitBACE, 1200);
		}
	}, 1000);
	updateBACETimerDisplay();
}

function updateBACETimerDisplay() {
	const el = document.getElementById("bace-timer");
	if (!el) return;
	const m = Math.floor(baceTimeLeft / 60);
	const s = baceTimeLeft % 60;
	el.textContent = `${m}:${s.toString().padStart(2, "0")}`;
	el.className =
		"bace-timer" + (baceTimeLeft < 300 ? " bace-timer-warning" : "");
}

// =================================================================
// BACE Nav Panel
// =================================================================
function injectBACENav() {
	// Remove old if present
	const old = document.getElementById("bace-nav-panel");
	if (old) old.remove();
	const old2 = document.getElementById("bace-submit-row");
	if (old2) old2.remove();

	// Timer bar
	const timerRow = document.createElement("div");
	timerRow.id = "bace-timer-row";
	timerRow.innerHTML = `
		<div class="bace-exam-label">🏛️ BACE EXAMINATION</div>
		<div class="bace-timer" id="bace-timer">90:00</div>`;
	document.getElementById("quiz-area").prepend(timerRow);

	// Question grid nav
	const panel = document.createElement("div");
	panel.id = "bace-nav-panel";
	panel.innerHTML = `
		<div class="bace-nav-label">Question Navigator</div>
		<div class="bace-nav-grid" id="bace-nav-grid"></div>`;
	document.getElementById("quiz-area").appendChild(panel);
	renderBACENav();

	// Submit button
	const submitRow = document.createElement("div");
	submitRow.id = "bace-submit-row";
	submitRow.innerHTML = `<button class="bace-submit-btn" onclick="confirmSubmitBACE()">Submit Exam →</button>`;
	document.getElementById("quiz-area").appendChild(submitRow);
}

function renderBACENav() {
	const grid = document.getElementById("bace-nav-grid");
	if (!grid) return;
	grid.innerHTML = "";
	activeQuestions.forEach((_, i) => {
		const btn = document.createElement("button");
		btn.className =
			"bace-nav-btn" +
			(i === currentQuestionIndex ? " bace-nav-current" : "") +
			(baceAnswers[i] !== undefined ? " bace-nav-answered" : "");
		btn.textContent = i + 1;
		btn.onclick = () => {
			currentQuestionIndex = i;
			loadQuestion();
		};
		grid.appendChild(btn);
	});
}

function confirmSubmitBACE() {
	const unanswered = activeQuestions.length - Object.keys(baceAnswers).length;
	if (unanswered > 0) {
		if (
			!confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)
		)
			return;
	}
	submitBACE();
}

function submitBACE() {
	clearInterval(baceTimerInterval);
	// Score the exam
	score = 0;
	activeQuestions.forEach((q, i) => {
		const given = baceAnswers[i];
		if (given !== undefined && isAnswerCorrect(q, given)) score++;
	});
	totalAnswered = activeQuestions.length;
	showBACEResults();
}

// =================================================================
// 4. Load Question
// =================================================================
function loadQuestion() {
	if (
		currentMode === "STANDARD" &&
		currentQuestionIndex >= activeQuestions.length
	) {
		showResults();
		return;
	}

	selectedOption = null;
	answerLocked = false;

	const q = activeQuestions[currentQuestionIndex];

	// Restore BACE selection if navigating back
	if (
		currentMode === "BACE" &&
		baceAnswers[currentQuestionIndex] !== undefined
	) {
		selectedOption = baceAnswers[currentQuestionIndex];
	}

	// HUD
	document.getElementById("hud-question").textContent =
		`${currentQuestionIndex + 1} / ${activeQuestions.length}`;
	document.getElementById("hud-score").textContent =
		currentMode === "BACE" ? "—" : score;
	document.getElementById("hud-streak").textContent =
		currentMode === "BACE" ? "—" : streak;
	document.getElementById("hud-accuracy").textContent =
		currentMode === "BACE"
			? "exam"
			: totalAnswered > 0
				? Math.round((score / totalAnswered) * 100) + "%"
				: "—";

	// Progress
	const pct = Math.round((currentQuestionIndex / activeQuestions.length) * 100);
	document.getElementById("progress-fill").style.width = pct + "%";
	document.getElementById("progress-pct").textContent = pct + "%";

	// Category tag with format badge
	const diffClass = `diff-${q.difficulty.toLowerCase()}`;
	const formatBadge = getFormatBadge(q.format);
	document.getElementById("category-name").innerHTML =
		`${q.categoryName} &nbsp;·&nbsp; <span class="${diffClass}">${q.difficulty}</span> &nbsp;·&nbsp; ${formatBadge}`;

	// Render by format
	renderQuestionByFormat(q);

	// Buttons
	const checkBtn = document.getElementById("check-btn");
	const nextBtn = document.getElementById("next-btn");

	if (currentMode === "BACE") {
		checkBtn.style.display = "none";
		nextBtn.style.display = "none";
		// BACE uses its own nav; show prev/next inside controls
		renderBACEControls();
		renderBACENav();
	} else {
		checkBtn.style.display = "block";
		nextBtn.style.display = "none";
	}

	document.getElementById("explanation-area").innerHTML = "";
}

function getFormatBadge(format) {
	const badges = {
		MCQ: '<span class="fmt-badge fmt-mcq">MCQ</span>',
		TRUE_FALSE: '<span class="fmt-badge fmt-tf">True/False</span>',
		FILL_BLANK: '<span class="fmt-badge fmt-fill">Fill-in-Blank</span>',
		MATCHING: '<span class="fmt-badge fmt-match">Matching</span>',
	};
	return badges[format] || badges.MCQ;
}

// =================================================================
// 4b. Render question by format
// =================================================================
function renderQuestionByFormat(q) {
	const qEl = document.getElementById("question-text");
	const ol = document.getElementById("options-list");
	ol.innerHTML = "";

	qEl.classList.remove("question-transition");
	void qEl.offsetWidth;
	qEl.classList.add("question-transition");

	if (q.format === "MCQ" || q.format === "TRUE_FALSE") {
		renderMCQ(q, qEl, ol);
	} else if (q.format === "FILL_BLANK") {
		renderFillBlank(q, qEl, ol);
	} else if (q.format === "MATCHING") {
		renderMatching(q, qEl, ol);
	} else {
		renderMCQ(q, qEl, ol);
	}
}

function renderMCQ(q, qEl, ol) {
	qEl.innerHTML = q.question;
	renderElementMath(qEl);

	for (const key of ["A", "B", "C", "D"]) {
		if (!q.options[key]) continue;
		const li = document.createElement("li");
		li.className = "option-item" + (selectedOption === key ? " selected" : "");
		li.setAttribute("data-key", key);
		li.innerHTML = `
            <span class="option-key">${key}</span>
            <span class="option-content">${q.options[key]}</span>
            <span class="option-result-icon"></span>`;
		li.addEventListener("click", () => handleOptionClick(li, key));
		ol.appendChild(li);
		renderElementMath(li.querySelector(".option-content"));
	}
}

function renderFillBlank(q, qEl, ol) {
	// Show question and a text input
	qEl.innerHTML = q.question;
	renderElementMath(qEl);

	const wrapper = document.createElement("li");
	wrapper.className = "fill-blank-wrapper";
	wrapper.innerHTML = `
		<div class="fill-hint">Type your answer below:</div>
		<input type="text" class="fill-input" id="fill-input" placeholder="Enter your answer…" autocomplete="off" spellcheck="false" />
		<div class="fill-hint-small">Hint: one of the original options is correct</div>
		<div class="fill-options-reveal" id="fill-options-reveal">
			${["A", "B", "C", "D"]
				.filter((k) => q.options[k])
				.map(
					(k) =>
						`<button class="fill-hint-opt" onclick="fillFromHint('${q.options[k]}')">${k}: ${q.options[k]}</button>`,
				)
				.join("")}
		</div>
		<button class="fill-hint-toggle" onclick="document.getElementById('fill-options-reveal').classList.toggle('show')">💡 Show options</button>`;
	ol.appendChild(wrapper);

	const input = document.getElementById("fill-input");
	if (selectedOption) input.value = selectedOption;
	input.addEventListener("input", () => {
		selectedOption = input.value;
	});
	setTimeout(() => input.focus(), 50);
}

function fillFromHint(text) {
	const input = document.getElementById("fill-input");
	if (input) {
		input.value = text;
		selectedOption = text;
	}
}

function renderMatching(q, qEl, ol) {
	qEl.innerHTML = `Match each item on the left to the correct description on the right.<br><small style="color:var(--text-muted);font-size:.8rem">(Based on: ${q.question})</small>`;
	renderElementMath(qEl);

	const wrapper = document.createElement("li");
	wrapper.className = "matching-wrapper";

	const items = q.matchItems; // [{letter, key, text}]
	const shuffled = q.matchShuffle; // [{key, text}] shuffled

	// Assign display letters 1-4 to left, A-D to right positions
	const leftLabels = items.map((_, i) => String(i + 1));

	wrapper.innerHTML = `
		<div class="matching-grid">
			<div class="matching-col">
				<div class="matching-col-header">Items</div>
				${items
					.map(
						(item, i) => `
					<div class="matching-left-item" data-idx="${i}">
						<span class="match-num">${leftLabels[i]}</span>
						<span class="match-text">${item.text}</span>
					</div>`,
					)
					.join("")}
			</div>
			<div class="matching-col">
				<div class="matching-col-header">Descriptions / Labels</div>
				${shuffled
					.map(
						(s, i) => `
					<div class="matching-right-item" data-skey="${s.key}" data-sidx="${i}">
						<span class="match-letter">${String.fromCharCode(65 + i)}</span>
						<span class="match-text">${s.text}</span>
					</div>`,
					)
					.join("")}
			</div>
		</div>
		<div class="matching-instructions">
			Enter matches as <strong>1→A, 2→B</strong> etc. using the selectors below:
		</div>
		<div class="matching-selectors" id="matching-selectors">
			${items
				.map(
					(item, i) => `
				<div class="match-selector-row">
					<span class="match-sel-left">${leftLabels[i]}. ${item.text.substring(0, 30)}${item.text.length > 30 ? "…" : ""}</span>
					<select class="match-select" data-itemidx="${i}" onchange="handleMatchSelect(this)">
						<option value="">—</option>
						${shuffled.map((_, j) => `<option value="${String.fromCharCode(65 + j)}" ${getMatchPreselect(i, j)}>${String.fromCharCode(65 + j)}</option>`).join("")}
					</select>
				</div>`,
				)
				.join("")}
		</div>`;

	ol.appendChild(wrapper);
}

function getMatchPreselect(itemIdx, shuffleIdx) {
	// If we have a saved matching answer
	if (!selectedOption || !selectedOption.matching) return "";
	const saved = selectedOption.matching[itemIdx];
	return saved === String.fromCharCode(65 + shuffleIdx) ? "selected" : "";
}

function handleMatchSelect(select) {
	if (!selectedOption || typeof selectedOption !== "object") {
		selectedOption = { matching: {} };
	}
	selectedOption.matching[parseInt(select.dataset.itemidx)] = select.value;
}

// =================================================================
// BACE controls (prev/next inside quiz area)
// =================================================================
function renderBACEControls() {
	const ctrl = document.querySelector(".controls");
	ctrl.innerHTML = "";

	if (currentQuestionIndex > 0) {
		const prev = document.createElement("button");
		prev.textContent = "← Previous";
		prev.className = "bace-prev-btn";
		prev.onclick = () => {
			saveBACEAnswer();
			currentQuestionIndex--;
			loadQuestion();
		};
		ctrl.appendChild(prev);
	}

	if (currentQuestionIndex < activeQuestions.length - 1) {
		const next = document.createElement("button");
		next.textContent = "Next →";
		next.className = "bace-next-btn";
		next.onclick = () => {
			saveBACEAnswer();
			currentQuestionIndex++;
			loadQuestion();
		};
		ctrl.appendChild(next);
	}
}

function saveBACEAnswer() {
	if (selectedOption !== null) {
		baceAnswers[currentQuestionIndex] = selectedOption;
	}
}

// =================================================================
// 5. Check Answer
// =================================================================
function checkAnswer() {
	if (answerLocked) {
		nextQuestion();
		return;
	}

	if (
		selectedOption === null ||
		selectedOption === "" ||
		(typeof selectedOption === "object" &&
			Object.keys(selectedOption.matching || {}).length === 0)
	) {
		const ol = document.getElementById("options-list");
		ol.classList.add("nudge");
		setTimeout(() => ol.classList.remove("nudge"), 350);
		showToast("Pick an answer first!", false);
		return;
	}

	answerLocked = true;
	totalAnswered++;

	const q = activeQuestions[currentQuestionIndex];
	const isRight = isAnswerCorrect(q, selectedOption);

	if (isRight) {
		score++;
		streak++;
	} else {
		streak = 0;
	}

	// Render result feedback based on format
	renderAnswerFeedback(q, isRight);

	// Update HUD
	document.getElementById("hud-score").textContent = score;
	document.getElementById("hud-streak").textContent = streak;
	document.getElementById("hud-accuracy").textContent =
		Math.round((score / totalAnswered) * 100) + "%";

	// Toast + confetti
	if (isRight) {
		const msgs = [
			"Correct! 🎯",
			"Nailed it! 🔬",
			"Excellent! ⚗️",
			"Spot on! 🧬",
		];
		showToast(msgs[Math.floor(Math.random() * msgs.length)], true);
		if (streak >= 3) launchConfetti();
		else launchMiniConfetti();
	} else {
		showToast(`Incorrect — see explanation below`, false);
	}

	// Explanation
	showExplanation(q, isRight);

	document.getElementById("check-btn").style.display = "none";
	document.getElementById("next-btn").style.display = "block";
}

// =================================================================
// Answer correctness logic by format
// =================================================================
function isAnswerCorrect(q, given) {
	if (q.format === "MCQ" || q.format === "TRUE_FALSE") {
		return given === q.answer;
	}
	if (q.format === "FILL_BLANK") {
		const correct = q.fillAnswer || q.options[q.answer] || "";
		const givenStr = (typeof given === "string" ? given : "")
			.trim()
			.toLowerCase();
		const correctStr = correct.trim().toLowerCase();
		// Also accept the letter key
		return (
			givenStr === correctStr ||
			givenStr === q.answer.toLowerCase() ||
			givenStr === q.options[q.answer]?.toLowerCase()
		);
	}
	if (q.format === "MATCHING") {
		if (!given || !given.matching) return false;
		const items = q.matchItems;
		const shuffled = q.matchShuffle;
		let allCorrect = true;
		items.forEach((item, i) => {
			const selectedLetter = given.matching[i]; // e.g. "B"
			if (!selectedLetter) {
				allCorrect = false;
				return;
			}
			const selectedIdx = selectedLetter.charCodeAt(0) - 65;
			const selectedShuffled = shuffled[selectedIdx];
			if (!selectedShuffled || selectedShuffled.key !== item.key)
				allCorrect = false;
		});
		return allCorrect;
	}
	return false;
}

// =================================================================
// Render answer feedback (lock options)
// =================================================================
function renderAnswerFeedback(q, isRight) {
	if (q.format === "MCQ" || q.format === "TRUE_FALSE") {
		document.querySelectorAll(".option-item").forEach((li) => {
			const k = li.getAttribute("data-key");
			li.classList.add("locked");
			if (k === q.answer) {
				li.classList.add("correct");
				li.querySelector(".option-result-icon").textContent = "✓";
			} else if (k === selectedOption && !isRight) {
				li.classList.add("incorrect");
				li.querySelector(".option-result-icon").textContent = "✗";
			}
		});
	} else if (q.format === "FILL_BLANK") {
		const input = document.getElementById("fill-input");
		if (input) {
			input.disabled = true;
			input.style.borderColor = isRight ? "var(--success)" : "var(--danger)";
			input.style.color = isRight ? "var(--success)" : "var(--danger)";
		}
	} else if (q.format === "MATCHING") {
		// Highlight selects
		document.querySelectorAll(".match-select").forEach((sel) => {
			sel.disabled = true;
			const itemIdx = parseInt(sel.dataset.itemidx);
			const item = q.matchItems[itemIdx];
			const givenLetter = selectedOption?.matching?.[itemIdx];
			if (!givenLetter) return;
			const givenIdx = givenLetter.charCodeAt(0) - 65;
			const givenShuffled = q.matchShuffle[givenIdx];
			const correct = givenShuffled?.key === item.key;
			sel.style.borderColor = correct ? "var(--success)" : "var(--danger)";
		});
	}
}

function showExplanation(q, isRight) {
	const area = document.getElementById("explanation-area");
	const inner = document.createElement("div");
	inner.className = `explanation-inner${isRight ? "" : " wrong"}`;

	let correctDisplay = "";
	if (q.format === "MCQ" || q.format === "TRUE_FALSE") {
		correctDisplay = `${q.answer}: ${q.options[q.answer]}`;
	} else if (q.format === "FILL_BLANK") {
		correctDisplay = q.fillAnswer || q.options[q.answer];
	} else if (q.format === "MATCHING") {
		correctDisplay = q.matchItems
			.map((item, i) => {
				const correctShuffleIdx = q.matchShuffle.findIndex(
					(s) => s.key === item.key,
				);
				const letter = String.fromCharCode(65 + correctShuffleIdx);
				return `${i + 1} → ${letter}`;
			})
			.join(", ");
	}

	inner.innerHTML = `
        <div class="explanation-verdict ${isRight ? "correct-label" : "wrong-label"}">
            ${isRight ? "✓ Correct" : "✗ Incorrect"}
        </div>
        <div class="explanation-answer">Correct Answer: <strong style="color:var(--success)">${correctDisplay}</strong></div>
        <div class="explanation-text">${q.explanation}</div>`;
	area.appendChild(inner);
	renderElementMath(inner.querySelector(".explanation-text"));
}

function nextQuestion() {
	currentQuestionIndex++;
	loadQuestion();
}

function handleOptionClick(li, key) {
	if (answerLocked) return;
	document
		.querySelectorAll(".option-item")
		.forEach((el) => el.classList.remove("selected"));
	li.classList.add("selected");
	selectedOption = key;
	if (currentMode === "BACE") baceAnswers[currentQuestionIndex] = key;
}

// =================================================================
// 6. Results — Standard
// =================================================================
function showResults() {
	document.getElementById("quiz-area").style.display = "none";
	document.getElementById("hud-bar").classList.remove("visible");
	document.getElementById("progress-wrap").classList.remove("visible");

	const total = activeQuestions.length;
	const pct = Math.round((score / total) * 100);
	const container = document.getElementById("score-container");
	container.style.display = "block";

	document.getElementById("ring-fraction").textContent = `${score}/${total}`;
	document.getElementById("score-breakdown").textContent =
		`${pct}% accuracy · ${total} questions`;

	const circumference = 364.4;
	const arc = document.getElementById("score-arc");
	setTimeout(() => {
		arc.style.transition = "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)";
		arc.style.strokeDashoffset = circumference - (circumference * pct) / 100;
	}, 100);

	let msg = "",
		color = "var(--text)";
	if (pct >= 90) {
		msg = "Outstanding work, scientist! 🏆";
		color = "var(--accent)";
	} else if (pct >= 75) {
		msg = "Great performance! Keep it up. 🔬";
		color = "var(--success)";
	} else if (pct >= 60) {
		msg = "Solid effort — review and retry! ⚗️";
		color = "var(--accent3)";
	} else {
		msg = "More lab time needed. You've got this! 🧬";
		color = "var(--danger)";
	}

	const msgEl = document.getElementById("score-message");
	msgEl.textContent = msg;
	msgEl.style.color = color;
	if (pct >= 75) launchConfetti();

	document.getElementById("retake-btn").onclick = () => {
		container.style.display = "none";
		arc.style.transition = "none";
		arc.style.strokeDashoffset = circumference;
		document.getElementById("setup-area").style.display = "block";
	};
}

// =================================================================
// 6b. Results — BACE
// =================================================================
function showBACEResults() {
	clearInterval(baceTimerInterval);
	document.getElementById("quiz-area").style.display = "none";
	document.getElementById("hud-bar").classList.remove("visible");
	document.getElementById("progress-wrap").classList.remove("visible");

	const total = activeQuestions.length;
	const pct = Math.round((score / total) * 100);
	const passed = pct >= BACE_CONFIG.passingPct;

	// Category breakdown
	const catScores = {};
	const catTotals = {};
	activeQuestions.forEach((q, i) => {
		if (!catScores[q.categoryKey]) {
			catScores[q.categoryKey] = 0;
			catTotals[q.categoryKey] = 0;
		}
		catTotals[q.categoryKey]++;
		if (baceAnswers[i] !== undefined && isAnswerCorrect(q, baceAnswers[i]))
			catScores[q.categoryKey]++;
	});

	const container = document.getElementById("score-container");
	container.style.display = "block";

	document.getElementById("ring-fraction").textContent = `${score}/${total}`;

	const breakdown = Object.keys(catTotals)
		.map((key) => {
			const cat = CATEGORY_MAP.find((c) => c.key === key);
			const pctCat = Math.round((catScores[key] / catTotals[key]) * 100);
			return `<div class="bace-cat-row">
			<span class="bace-cat-name">${cat ? cat.name : key}</span>
			<div class="bace-cat-bar-wrap"><div class="bace-cat-bar" style="width:${pctCat}%;background:${pctCat >= 80 ? "var(--success)" : "var(--danger)"}"></div></div>
			<span class="bace-cat-pct">${catScores[key]}/${catTotals[key]}</span>
		</div>`;
		})
		.join("");

	document.getElementById("score-breakdown").innerHTML =
		`<div class="bace-result-header">${pct}% · ${passed ? "✅ PASS" : "❌ FAIL"} (need ${BACE_CONFIG.passingPct}%)</div>
		<div class="bace-domain-breakdown">${breakdown}</div>`;

	const msgEl = document.getElementById("score-message");
	msgEl.textContent = passed
		? "Congratulations — BACE Exam Passed! 🏆"
		: `Score: ${pct}% — Need ${BACE_CONFIG.passingPct}% to pass. Keep studying! 📚`;
	msgEl.style.color = passed ? "var(--success)" : "var(--danger)";

	const circumference = 364.4;
	const arc = document.getElementById("score-arc");
	setTimeout(() => {
		arc.style.transition = "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)";
		arc.style.strokeDashoffset = circumference - (circumference * pct) / 100;
	}, 100);

	if (passed) launchConfetti();

	document.getElementById("retake-btn").onclick = () => {
		container.style.display = "none";
		arc.style.transition = "none";
		arc.style.strokeDashoffset = circumference;
		document.getElementById("setup-area").style.display = "block";
	};
}

// =================================================================
// 7. Toast
// =================================================================
function showToast(msg, correct) {
	const t = document.getElementById("feedback-toast");
	t.textContent = msg;
	t.className = correct ? "show correct-toast" : "show wrong-toast";
	clearTimeout(t._timeout);
	t._timeout = setTimeout(() => {
		t.className = "";
	}, 2200);
}

// =================================================================
// 8. Confetti
// =================================================================
function launchConfetti() {
	spawnParticles(120);
}
function launchMiniConfetti() {
	spawnParticles(40);
}

function spawnParticles(count) {
	const canvas = document.getElementById("confetti-canvas");
	const ctx = canvas.getContext("2d");
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	const colors = [
		"#00e5ff",
		"#7c3aed",
		"#f59e0b",
		"#10b981",
		"#ef4444",
		"#ffffff",
	];
	const particles = Array.from({ length: count }, () => ({
		x: Math.random() * canvas.width,
		y: -10,
		vx: (Math.random() - 0.5) * 6,
		vy: Math.random() * 4 + 2,
		rot: Math.random() * 360,
		rotV: (Math.random() - 0.5) * 8,
		size: Math.random() * 8 + 4,
		color: colors[Math.floor(Math.random() * colors.length)],
		shape: Math.random() > 0.5 ? "rect" : "circle",
		life: 1,
	}));
	let frame;
	function draw() {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		let alive = false;
		for (const p of particles) {
			p.x += p.vx;
			p.y += p.vy;
			p.vy += 0.1;
			p.rot += p.rotV;
			if (p.y < canvas.height + 20) {
				alive = true;
				ctx.save();
				ctx.translate(p.x, p.y);
				ctx.rotate((p.rot * Math.PI) / 180);
				ctx.globalAlpha = Math.max(0, 1 - p.y / canvas.height);
				ctx.fillStyle = p.color;
				if (p.shape === "rect")
					ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
				else {
					ctx.beginPath();
					ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
					ctx.fill();
				}
				ctx.restore();
			}
		}
		if (alive) frame = requestAnimationFrame(draw);
		else ctx.clearRect(0, 0, canvas.width, canvas.height);
	}
	cancelAnimationFrame(frame);
	draw();
}

// =================================================================
// 9. Keyboard Navigation
// =================================================================
document.addEventListener("keydown", (e) => {
	const quizVisible =
		document.getElementById("quiz-area").style.display !== "none";
	if (!quizVisible || currentMode === "BACE") return;
	const key = e.key.toUpperCase();
	if (["A", "B", "C", "D"].includes(key)) {
		const q = activeQuestions[currentQuestionIndex];
		if (q && (q.format === "MCQ" || q.format === "TRUE_FALSE")) {
			const li = document.querySelector(`.option-item[data-key="${key}"]`);
			if (li && !answerLocked) li.click();
		}
	} else if (e.key === "Enter") {
		if (!answerLocked) checkAnswer();
		else nextQuestion();
	}
});

// =================================================================
// 10. Boot
// =================================================================
document.addEventListener("DOMContentLoaded", () => {
	fetchQuizData();
	document.getElementById("check-btn").addEventListener("click", () => {
		if (!answerLocked) checkAnswer();
	});
	document.getElementById("next-btn").addEventListener("click", nextQuestion);
});

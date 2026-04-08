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

// State
let currentQuestionIndex = 0;
let score = 0;
let streak = 0;
let totalAnswered = 0;
let selectedOption = null;
let activeQuestions = [];
let allQuestionsFlat = [];
let answerLocked = false;

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
        <div class="selection-container">
            <span class="section-label">Difficulty</span>
            <div id="difficulty-checkbox-list" class="checkbox-list"></div>
        </div>
        <div class="selection-container">
            <span class="section-label">Categories &mdash; ${QUESTIONS_PER_CATEGORY} questions each</span>
            <div id="category-checkbox-list" class="checkbox-list"></div>
        </div>
        <div class="controls" style="margin-top:20px">
            <button id="start-btn">Start Quiz →</button>
        </div>`;

	populateDifficultyCheckboxes(
		document.getElementById("difficulty-checkbox-list"),
	);
	populateCategoryCheckboxes(document.getElementById("category-checkbox-list"));
	document.getElementById("start-btn").addEventListener("click", startQuiz);
	renderElementMath(setup);
}

// =================================================================
// 2. Setup Helpers
// =================================================================
function populateDifficultyCheckboxes(el) {
	el.innerHTML = "";
	addCheckbox(el, "check-all-difficulty", "ALL", "All Difficulties", true);
	DIFFICULTY_LEVELS.forEach((d) => addCheckbox(el, null, d, d, true));
	el.querySelector("#check-all-difficulty").addEventListener(
		"change",
		function () {
			el.querySelectorAll(
				"input[type=checkbox]:not(#check-all-difficulty)",
			).forEach((c) => (c.checked = this.checked));
		},
	);
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

function getSelectedValues(listId, allId) {
	const el = document.getElementById(listId);
	if (!el) return [];
	const all = el.querySelector(`#${allId}`);
	const allChecks = el.querySelectorAll("input[type=checkbox]");
	const checkedNonAll = el.querySelectorAll(
		`input[type=checkbox]:checked:not(#${allId})`,
	);
	if (all && all.checked && checkedNonAll.length === allChecks.length - 1)
		return ["ALL"];
	return Array.from(checkedNonAll).map((c) => c.value);
}

function shuffleArray(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

// =================================================================
// 3. Start Quiz
// =================================================================
function startQuiz() {
	const selDiff = getSelectedValues(
		"difficulty-checkbox-list",
		"check-all-difficulty",
	);
	const selCats = getSelectedValues(
		"category-checkbox-list",
		"check-all-category",
	);

	if (!selDiff.length || !selCats.length) {
		showToast("Select at least one difficulty and category", false);
		return;
	}

	const filtered = allQuestionsFlat.filter(
		(q) =>
			(selDiff.includes("ALL") || selDiff.includes(q.difficulty)) &&
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

	if (!activeQuestions.length) {
		showToast("No questions match those filters", false);
		return;
	}

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
// 4. Load Question
// =================================================================
function loadQuestion() {
	if (currentQuestionIndex >= activeQuestions.length) {
		showResults();
		return;
	}

	selectedOption = null;
	answerLocked = false;

	const q = activeQuestions[currentQuestionIndex];

	// HUD
	document.getElementById("hud-question").textContent =
		`${currentQuestionIndex + 1} / ${activeQuestions.length}`;
	document.getElementById("hud-score").textContent = score;
	document.getElementById("hud-streak").textContent = streak;
	document.getElementById("hud-accuracy").textContent =
		totalAnswered > 0 ? Math.round((score / totalAnswered) * 100) + "%" : "—";

	// Progress
	const pct = Math.round((currentQuestionIndex / activeQuestions.length) * 100);
	document.getElementById("progress-fill").style.width = pct + "%";
	document.getElementById("progress-pct").textContent = pct + "%";

	// Category tag
	const diffClass = `diff-${q.difficulty.toLowerCase()}`;
	document.getElementById("category-name").innerHTML =
		`${q.categoryName} &nbsp;·&nbsp; <span class="${diffClass}">${q.difficulty}</span>`;

	// Question
	const qEl = document.getElementById("question-text");
	qEl.innerHTML = q.question;
	qEl.classList.remove("question-transition");
	void qEl.offsetWidth; // reflow for re-animation
	qEl.classList.add("question-transition");
	renderElementMath(qEl);

	// Options
	const ol = document.getElementById("options-list");
	ol.innerHTML = "";

	for (const key of ["A", "B", "C", "D"]) {
		if (!q.options[key]) continue;
		const li = document.createElement("li");
		li.className = "option-item";
		li.setAttribute("data-key", key);
		li.innerHTML = `
            <span class="option-key">${key}</span>
            <span class="option-content">${q.options[key]}</span>
            <span class="option-result-icon"></span>`;
		li.addEventListener("click", () => handleOptionClick(li, key));
		ol.appendChild(li);
		renderElementMath(li.querySelector(".option-content"));
	}

	// Buttons
	const checkBtn = document.getElementById("check-btn");
	const nextBtn = document.getElementById("next-btn");
	checkBtn.style.display = "block";
	nextBtn.style.display = "none";
	document.getElementById("explanation-area").innerHTML = "";
}

function handleOptionClick(li, key) {
	if (answerLocked) return;
	document
		.querySelectorAll(".option-item")
		.forEach((el) => el.classList.remove("selected"));
	li.classList.add("selected");
	selectedOption = key;
}

// =================================================================
// 5. Check Answer
// =================================================================
function checkAnswer() {
	if (answerLocked) {
		nextQuestion();
		return;
	}

	if (selectedOption === null) {
		const ol = document.getElementById("options-list");
		ol.classList.add("nudge");
		setTimeout(() => ol.classList.remove("nudge"), 350);
		showToast("Pick an answer first!", false);
		return;
	}

	answerLocked = true;
	totalAnswered++;

	const q = activeQuestions[currentQuestionIndex];
	const correct = q.answer;
	const isRight = selectedOption === correct;

	if (isRight) {
		score++;
		streak++;
	} else {
		streak = 0;
	}

	// Style options
	document.querySelectorAll(".option-item").forEach((li) => {
		const k = li.getAttribute("data-key");
		li.classList.add("locked");
		if (k === correct) {
			li.classList.add("correct");
			li.querySelector(".option-result-icon").textContent = "✓";
		} else if (k === selectedOption && !isRight) {
			li.classList.add("incorrect");
			li.querySelector(".option-result-icon").textContent = "✗";
		}
	});

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
		showToast(`Correct answer: ${correct}`, false);
	}

	// Explanation
	const area = document.getElementById("explanation-area");
	const inner = document.createElement("div");
	inner.className = `explanation-inner${isRight ? "" : " wrong"}`;
	inner.innerHTML = `
        <div class="explanation-verdict ${isRight ? "correct-label" : "wrong-label"}">
            ${isRight ? "✓ Correct" : "✗ Incorrect"}
        </div>
        <div class="explanation-answer">Correct Answer: <strong style="color:var(--success)">${correct}</strong></div>
        <div class="explanation-text">${q.explanation}</div>`;
	area.appendChild(inner);
	renderElementMath(inner.querySelector(".explanation-text"));

	// Button swap
	document.getElementById("check-btn").style.display = "none";
	document.getElementById("next-btn").style.display = "block";
}

function nextQuestion() {
	currentQuestionIndex++;
	loadQuestion();
}

// =================================================================
// 6. Results
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

	// Animate SVG arc
	const circumference = 364.4;
	const arc = document.getElementById("score-arc");
	setTimeout(() => {
		arc.style.transition = "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)";
		arc.style.strokeDashoffset = circumference - (circumference * pct) / 100;
	}, 100);

	// Message
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
				if (p.shape === "rect") {
					ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
				} else {
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
	if (!quizVisible) return;

	const key = e.key.toUpperCase();
	if (["A", "B", "C", "D"].includes(key)) {
		const li = document.querySelector(`.option-item[data-key="${key}"]`);
		if (li && !answerLocked) {
			li.click();
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

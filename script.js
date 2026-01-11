// =================================================================
// 0. Configuration & Setup
// =================================================================

// ⚠️ IMPORTANT: REPLACE THIS PLACEHOLDER with your actual deployed Google Apps Script URL
const SHEET_API_URL = "https://script.google.com/macros/s/AKfycbwbImwdivb5lrsvwNjt_d2bnG63_0icTGg4QlUoR-nKH0FR5ZD-hkzA8t_vnCMzOmNJ/exec"; 

// Define the number of questions to select per category
const QUESTIONS_PER_CATEGORY = 3; 

// Category mapping (must match the CategoryKey column in your Sheet)
const CATEGORY_MAP = [
    { key: "TECHNICAL", name: "1. Technical Skills and Applications" },
    { key: "SAFETY", name: "2. Safety and Workplace Culture" },
    { key: "BIOCHEM", name: "3. Biochemistry and Molecular Biology" },
    { key: "REGULATION", name: "4. Regulation and Quality" },
    { key: "BIOTECH", name: "5. Biotechnology Skills" },
    { key: "MATH", name: "6. Applied Mathematics" },
    { key: "EQUIPMENT", name: "7. Standard Equipment" },
    { key: "DATA", name: "8. Experimental and Design Data Analysis" },
];
const DIFFICULTY_LEVELS = ["EASY", "MEDIUM", "HARD"];

// Global Quiz State Variables
let currentQuestionIndex = 0;
let score = 0;
let selectedOption = null;
let activeQuestions = []; // The final list of questions for the current quiz run
let allQuestionsFlat = []; // Stores all processed data loaded from Google Sheets

// =================================================================
// KaTeX LaTeX Rendering Function (Targeted Helper)
// =================================================================

/**
 * Renders LaTeX notation within a specific DOM element.
 * This targeted approach is more reliable for dynamically injected content.
 */
function renderElementMath(element) {
    if (typeof renderMathInElement === 'function' && element) {
        renderMathInElement(element, {
            // Crucial: Explicitly define $...$ for inline LaTeX
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false} 
            ],
            trust: true 
        });
    }
}


// =================================================================
// 1. Data Fetching and Initialization
// =================================================================

async function fetchQuizData() {
    const setupArea = document.getElementById('setup-area');
    setupArea.innerHTML = "<h2>Loading Questions... Please wait.</h2><p>Attempting to connect to Google Sheets API...</p>";
    
    try {
        const response = await fetch(SHEET_API_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const rawData = await response.json();
        
        // Map and clean the raw sheet data
        allQuestionsFlat = rawData.map(item => {
            const categoryObj = CATEGORY_MAP.find(c => c.key === item.CategoryKey) || { name: item.CategoryKey };
            
            return {
                difficulty: item.Difficulty ? item.Difficulty.toUpperCase() : "MEDIUM",
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
                categoryName: categoryObj.name
            };
        }).filter(q => q.question && q.answer); 
        
        if (allQuestionsFlat.length === 0) {
             throw new Error("Data loaded successfully, but the sheet appears empty or headers are missing.");
        }

        console.log(`Successfully loaded ${allQuestionsFlat.length} questions.`);

        // --- Rebuild the Setup Area ---
        setupArea.innerHTML = `
            <h2>Quiz Setup (${allQuestionsFlat.length} Total Questions Loaded)</h2>
            <div class="selection-container">
                <label>Select Difficulty:</label>
                <div id="difficulty-checkbox-list" class="checkbox-list difficulty-list"></div>
            </div>
            <div class="selection-container">
                <label>Select Categories (Will select ${QUESTIONS_PER_CATEGORY} Qs per type):</label>
                <div id="category-checkbox-list" class="checkbox-list category-list"></div>
            </div>
            <button id="start-btn">Start Quiz</button><hr>`;
            
        // Get newly rendered DOM elements
        const difficultyCheckboxList = document.getElementById('difficulty-checkbox-list');
        const categoryCheckboxList = document.getElementById('category-checkbox-list');
        const startBtn = document.getElementById('start-btn');

        // Populate checkboxes
        populateDifficultyCheckboxes(difficultyCheckboxList);
        populateCategoryCheckboxes(categoryCheckboxList);
        
        // Attach listener
        startBtn.addEventListener('click', startQuiz);
        
        // Render math in the newly created setup area (for category names)
        renderElementMath(setupArea); // Targeted rendering on setup area

    } catch (error) {
        console.error("Failed to load quiz data:", error);
        setupArea.innerHTML = `<h2>Error Loading Data</h2><p>Could not load data from the API endpoint. Please check the URL and deployment settings.</p><p>Error: ${error.message}</p>`;
    }
}

// =================================================================
// 2. Setup and Filtering Functions
// =================================================================
// (These functions remain unchanged from the previous correct version)

function populateDifficultyCheckboxes(listElement) {
    listElement.innerHTML = '';
    let allLabel = document.createElement('label');
    allLabel.innerHTML = `<input type="checkbox" id="check-all-difficulty" value="ALL" checked> All Difficulties`;
    listElement.appendChild(allLabel);

    DIFFICULTY_LEVELS.forEach(level => {
        let label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" value="${level}" checked> ${level}`;
        listElement.appendChild(label);
    });

    allLabel.querySelector('input').addEventListener('change', function() {
        const isChecked = this.checked;
        listElement.querySelectorAll('input[type="checkbox"]:not(#check-all-difficulty)').forEach(checkbox => {
            checkbox.checked = isChecked;
        });
    });
}

function populateCategoryCheckboxes(listElement) {
    listElement.innerHTML = ''; 

    let allLabel = document.createElement('label');
    allLabel.innerHTML = `<input type="checkbox" id="check-all-category" value="ALL" checked> All Categories (All ${CATEGORY_MAP.length} Types)`;
    listElement.appendChild(allLabel);
    
    CATEGORY_MAP.forEach(cat => {
        let label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" value="${cat.key}" checked> ${cat.name}`;
        listElement.appendChild(label);
    });
    
    allLabel.querySelector('input').addEventListener('change', function() {
        const isChecked = this.checked;
        listElement.querySelectorAll('input[type="checkbox"]:not(#check-all-category)').forEach(checkbox => {
            checkbox.checked = isChecked;
        });
    });
}

function getSelectedCheckboxes(allId) {
    const listElementId = allId.includes('difficulty') ? 'difficulty-checkbox-list' : 'category-checkbox-list';
    const listElement = document.getElementById(listElementId);
    
    if (!listElement) return []; 

    const selected = [];
    const allCheckbox = listElement.querySelector(`#${allId}`);
    
    if (allCheckbox && allCheckbox.checked && listElement.querySelectorAll('input[type="checkbox"]:checked').length === listElement.querySelectorAll('input[type="checkbox"]').length) {
         return ["ALL"];
    }

    listElement.querySelectorAll('input[type="checkbox"]:checked:not(#check-all-difficulty):not(#check-all-category)').forEach(checkbox => {
        selected.push(checkbox.value);
    });
    return selected;
}

// Fisher-Yates shuffle algorithm
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function startQuiz() {
    const selectedDifficulties = getSelectedCheckboxes('check-all-difficulty');
    const selectedCategories = getSelectedCheckboxes('check-all-category');
    
    if (selectedDifficulties.length === 0 || selectedCategories.length === 0) {
        alert("Please select at least one difficulty and one category to start the quiz.");
        return;
    }

    // 1. Filter by Difficulty
    let filteredByDifficulty = allQuestionsFlat.filter(q => {
        const difficultyMatch = selectedDifficulties.includes("ALL") || 
                                selectedDifficulties.includes(q.difficulty.toUpperCase());
        return difficultyMatch;
    });

    // 2. Group Questions by Category (and filter by selected category)
    const questionsByCategory = {};
    filteredByDifficulty.forEach(q => {
        const categoryKey = q.categoryKey;
        if (selectedCategories.includes("ALL") || selectedCategories.includes(categoryKey)) {
            if (!questionsByCategory[categoryKey]) {
                questionsByCategory[categoryKey] = [];
            }
            questionsByCategory[categoryKey].push(q);
        }
    });

    // 3. Select N Random Questions per Category
    activeQuestions = [];
    
    for (const key in questionsByCategory) {
        let categoryList = questionsByCategory[key];
        
        categoryList = shuffleArray(categoryList); 
        
        const selected = categoryList.slice(0, QUESTIONS_PER_CATEGORY);
        
        activeQuestions.push(...selected);
    }
    
    if (activeQuestions.length === 0) {
        alert("No questions found for the selected criteria. Adjust your filters.");
        document.getElementById('setup-area').style.display = 'block';
        return;
    }
    
    // 4. Final Shuffle and Start Quiz
    activeQuestions = shuffleArray(activeQuestions);

    document.getElementById('setup-area').style.display = 'none';
    document.getElementById('quiz-area').style.display = 'block';
    
    currentQuestionIndex = 0;
    score = 0;
    loadQuestion();
}


// =================================================================
// 3. Core Quiz Functions (Includes Targeted KaTeX Rendering)
// =================================================================

function loadQuestion() {
    const quizArea = document.getElementById('quiz-area');
    const scoreContainer = document.getElementById('score-container');
    const questionNumberEl = document.getElementById('question-number');
    const questionTextEl = document.getElementById('question-text');
    const optionsListEl = document.getElementById('options-list');
    const checkBtn = document.getElementById('check-btn');
    const nextBtn = document.getElementById('next-btn');
    const explanationArea = document.getElementById('explanation-area');
    const categoryNameEl = document.getElementById('category-name');

    if (currentQuestionIndex >= activeQuestions.length) {
        quizArea.style.display = 'none';
        scoreContainer.style.display = 'block';
        document.getElementById('final-score').textContent = score;
        document.getElementById('total-questions').textContent = activeQuestions.length;
        document.getElementById('retake-btn').addEventListener('click', () => {
             scoreContainer.style.display = 'none';
             document.getElementById('setup-area').style.display = 'block';
        });
        // Render math in the final score area if necessary
        renderElementMath(scoreContainer); 
        return;
    }

    // Reset state
    selectedOption = null;
    explanationArea.innerHTML = '';
    optionsListEl.innerHTML = '';
    checkBtn.style.display = 'block';
    nextBtn.style.display = 'none';

    const currentQ = activeQuestions[currentQuestionIndex];
    
    // Update display elements
    questionNumberEl.textContent = `Question ${currentQuestionIndex + 1} / ${activeQuestions.length}`;
    questionTextEl.innerHTML = currentQ.question;
    categoryNameEl.textContent = `(${currentQ.categoryName} - ${currentQ.difficulty})`;
    
    // CRITICAL: Render math on the question text immediately
    renderElementMath(questionTextEl); // <--- RENDER QUESTION TEXT

    // Load options
    for (const key in currentQ.options) {
        const optionText = currentQ.options[key];
        const li = document.createElement('li');
        li.className = 'option-item';
        
        // Use a <span> inside the <li> to isolate the text for rendering
        // This is necessary because li.innerHTML must contain the <strong> tag
        li.innerHTML = `<strong>${key}.</strong> <span class="option-content">${optionText}</span>`;
        li.setAttribute('data-key', key);
        
        li.addEventListener('click', () => {
            if (checkBtn.style.display !== 'none') {
                selectOption(li, key);
            }
        });
        optionsListEl.appendChild(li);

        // CRITICAL: Render math on the specific option content
        const optionContentElement = li.querySelector('.option-content');
        if (optionContentElement) {
            renderElementMath(optionContentElement); // <--- RENDER OPTION TEXT
        }
    }
}

function selectOption(selectedLi, key) {
    const optionsListEl = document.getElementById('options-list');
    optionsListEl.querySelectorAll('.option-item').forEach(item => {
        item.classList.remove('selected');
    });
    selectedLi.classList.add('selected');
    selectedOption = key;
}

function checkAnswer() {
    const optionsListEl = document.getElementById('options-list');
    const checkBtn = document.getElementById('check-btn');
    const nextBtn = document.getElementById('next-btn');
    const explanationArea = document.getElementById('explanation-area');

    if (selectedOption === null) {
        alert("Please select an answer before checking!");
        return;
    }

    const currentQ = activeQuestions[currentQuestionIndex];
    const correctAnswer = currentQ.answer;

    checkBtn.style.display = 'none';
    nextBtn.style.display = 'block';

    const options = optionsListEl.querySelectorAll('.option-item');
    options.forEach(item => {
        const key = item.getAttribute('data-key');
        if (key === correctAnswer) {
            item.classList.add('correct');
        } else if (key === selectedOption) {
            item.classList.add('incorrect');
        }
        item.style.pointerEvents = 'none';
    }); 

    if (selectedOption === correctAnswer) {
        score++;
    }

    explanationArea.innerHTML = `
        <div class="explanation">
            <strong>Correct Answer: ${correctAnswer}</strong>
            <p class="explanation-text">${currentQ.explanation}</p>
        </div>
    `;
    
    // CRITICAL: Render the LaTeX in the newly displayed explanation
    const explanationTextElement = explanationArea.querySelector('.explanation-text');
    if (explanationTextElement) {
        renderElementMath(explanationTextElement); // <--- RENDER EXPLANATION TEXT
    }
}

function nextQuestion() {
    currentQuestionIndex++;
    loadQuestion();
}

// =================================================================
// 4. Initialization
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Start the process by fetching data
    fetchQuizData(); 

    // Attach core quiz buttons (assuming they exist in the HTML template)
    document.getElementById('check-btn').addEventListener('click', checkAnswer);
    document.getElementById('next-btn').addEventListener('click', nextQuestion);
});

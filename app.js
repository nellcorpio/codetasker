const API_URL = './api.php';
const USE_DUMMY = false; // Toggle this to save tokens
const MAX_RETRIES = 3; // Prevent infinite recursion

const DUMMY_PROBLEMS = {
    'challenge': {
        javascript: {
            title: "Array Transformation Challenge",
            description: "<p>You are given an array of integers. Write a function <code>transformData</code> that performs the following:</p><ul><li>Filters out numbers less than 10.</li><li>Squares the remaining numbers.</li><li>Returns the final array sorted in descending order.</li></ul><p><b>Example:</b><br>Input: [5, 12, 8, 15, 3]<br>Output: [225, 144]</p>",
            starterCode: "/**\n * @param {number[]} arr\n * @return {number[]}\n */\nfunction transformData(arr) {\n    // Your code here\n}"
        },
        python: {
            title: "Dictionary Frequency Map",
            description: "<p>Write a function <code>get_frequency</code> that takes a list of strings and returns a frequency map (dictionary).</p><p><b>Example:</b><br>Input: ['apple', 'banana', 'apple']<br>Output: {'apple': 2, 'banana': 1}</p>",
            starterCode: "def get_frequency(items):\n    # Your code here\n    pass"
        }
    },
    'multiple-choice': {
        javascript: {
            questions: [
                { question: "What is the output of typeof null?", options: ["object", "null", "undefined", "string"], answer: 0 },
                { question: "Which method adds an element to the end of an array?", options: ["push()", "pop()", "shift()", "unshift()"], answer: 0 }
            ]
        }
    },
    'fill-blanks': {
        javascript: {
            questions: [
                { title: "Variable Declaration", code: "const x = {{blank}};\nconsole.log(x);", answers: ["10"] },
                { title: "Function Definition", code: "function greet() {\n    return {{blank}};\n}", answers: ["'Hello'"] }
            ]
        }
    }
};

const DUMMY_EVALUATION = {
    score: 94,
    rating: "★★★★★",
    feedback: "Exceptional implementation! Your use of high-order functions (filter, map, sort) demonstrates a strong grasp of modern language features. The logic is concise and highly readable. Your solution handles the edge cases perfectly.",
    suggestions: [
        "<strong>Performance:</strong> Consider a single-pass reduce if the dataset becomes massive.",
        "<strong>Security:</strong> Add a check for null or undefined input arrays.",
        "<strong>Style:</strong> Use implicit returns in arrow functions for even cleaner logic."
    ]
};

const DIFFICULTY_GUIDELINES = {
    Beginner: "Basic syntax, variables, simple arithmetic, and printing output. No complex logic or standard libraries.",
    Easy: "Easy loops, Easy arrays, Easy simple string manipulation, and Easy standard mathematical functions.",
    Medium: "Medium multidimensional arrays, Medium nested loops, Medium basic data structures (sets, maps), and Medium basic sorting/searching.",
    Hard: "Hard complex algorithms, Hard custom classes/interfaces, Hard memory management concepts, and Hard performance optimization.",
    Expert: "Expert advanced system design, Expert design patterns, Expert complex concurrency/asynchrony, Expert deep language-specific optimizations, and Expert intricate algorithmic complexity."
};

const MODE_SETTINGS = {
    Beginner: { time: 300, questions: 5 },
    Easy: { time: 600, questions: 5 },
    Medium: { time: 900, questions: 10 },
    Hard: { time: 1200, questions: 15 },
    Expert: { time: 1500, questions: 20 }
};

// App State
let editor = null;
let currentLanguage = 'javascript';
let currentDifficulty = 'Beginner';
let currentMode = 'challenge';
let violationDetected = false;
let timerStarted = false;
let timerInterval = null;
let secondsRemaining = 0;
let secondsElapsed = 0;
let pasteCount = 0;
let retryCount = 0;

// Quiz State
let quizQuestions = [];
let currentQuestionIndex = 0;
let userAnswers = [];

// Main Navigation Views
const views = {
    setup: document.getElementById('setup-view'),
    loading: document.getElementById('loading-view'),
    challenge: document.getElementById('challenge-view'),
    results: document.getElementById('results-view')
};

// Persistent Components
const components = {
    violation: document.getElementById('violation-overlay'),
    statusBar: document.getElementById('status-bar'),
    timer: document.getElementById('timer'),
    challengeTimer: document.getElementById('challenge-timer-val')
};

const buttons = {
    start: document.getElementById('start-btn'),
    submit: document.getElementById('submit-btn'),
    reset: document.getElementById('reset-btn'),
    restart: document.getElementById('restart-btn')
};

const selects = {
    difficultyGrid: document.getElementById('difficulty-grid'),
    languageGrid: document.getElementById('language-grid')
};

// Selection Card Logic
function initSelectionCards() {
    setupCardListeners('difficulty-grid', (val) => { currentDifficulty = val; });
    setupCardListeners('language-grid', (val) => { currentLanguage = val; });
    setupCardListeners('mode-grid', (val) => { currentMode = val; });
}

function setupCardListeners(gridId, callback) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    grid.addEventListener('click', (e) => {
        const card = e.target.closest('.selection-card');
        if (!card) return;

        // Update UI
        grid.querySelectorAll('.selection-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');

        // Update State
        const value = card.dataset.value;
        callback(value);
    });
}

// Global Init
initSelectionCards();

// Sync initial state with UI (active cards)
function syncInitialSelection() {
    ['difficulty-grid', 'language-grid', 'mode-grid'].forEach(gridId => {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        const activeCard = grid.querySelector('.selection-card.active');
        if (activeCard) {
            const val = activeCard.dataset.value;
            if (gridId === 'difficulty-grid') currentDifficulty = val;
            if (gridId === 'language-grid') currentLanguage = val;
            if (gridId === 'mode-grid') currentMode = val;
        }
    });
}
syncInitialSelection();

// Initialize Monaco Editor
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });

function initEditor(language, initialCode = '') {
    if (editor) {
        editor.dispose();
    }

    require(['vs/editor/editor.main'], function () {
        editor = monaco.editor.create(document.getElementById('editor-container'), {
            value: initialCode,
            language: language,
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 16,
            minimap: { enabled: false },
            padding: { top: 20 },
            roundedSelection: true,
            scrollbar: {
                vertical: 'visible',
                horizontal: 'visible'
            }
        });

        // Anti-Cheat: Paste Detection
        editor.onDidPaste((e) => {
            pasteCount++;
            const pastedText = editor.getModel().getValueInRange(e.range);

            // Rule 1: No large pastes
            if (pastedText.length > 50) triggerViolation();

            // Rule 2: No pasting within the first 15 seconds of the session
            if (timerStarted && secondsElapsed < 15) triggerViolation();

            // Rule 3: No pasting more than 5 times total
            if (pasteCount >= 5) triggerViolation();
        });

        // Timer Trigger: On Typing
        editor.onDidChangeModelContent(() => {
            if (!timerStarted && !violationDetected) {
                const currentVal = editor.getValue();
                if (currentVal.trim().length > 0) {
                    startTimer();
                }
            }
        });
    });
}

function startTimer() {
    if (timerStarted) return;
    timerStarted = true;

    if (timerInterval) clearInterval(timerInterval);

    secondsElapsed = 0;
    const settings = MODE_SETTINGS[currentDifficulty] || MODE_SETTINGS.Beginner;
    secondsRemaining = settings.time;

    updateTimerDisplay(); // Update immediately

    timerInterval = setInterval(() => {
        secondsElapsed++;
        if (currentMode !== 'challenge') {
            secondsRemaining--;
            if (secondsRemaining <= 0) {
                secondsRemaining = 0;
                stopTimer();
                alert("Time is up!");
                evaluateSolution();
            }
        }
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const timeToDisplay = currentMode === 'challenge' ? secondsElapsed : secondsRemaining;
    const formatted = formatTime(timeToDisplay);
    if (components.timer) components.timer.textContent = formatted;
    if (components.challengeTimer) components.challengeTimer.textContent = formatted;
}

function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerStarted = false;
}

function triggerViolation() {
    stopTimer();
    violationDetected = true;
    showOverlay('violation');
}

function resetState() {
    violationDetected = false;
    timerStarted = false;
    secondsElapsed = 0;
    pasteCount = 0;
    retryCount = 0;
    if (components.timer) components.timer.textContent = '00:00';
    if (components.challengeTimer) components.challengeTimer.textContent = '00:00';
    if (components.violation) components.violation.classList.add('hidden');
}

function showView(viewName) {
    Object.keys(views).forEach(key => {
        views[key].classList.add('hidden');
    });
    if (views[viewName]) {
        views[viewName].classList.remove('hidden');
    }
}

function showOverlay(name) {
    if (components[name]) {
        components[name].classList.remove('hidden');
    }
}

// AI Integration
async function callGemini(prompt) {
    if (USE_DUMMY) return null;

    // Track current view to revert if error occurs
    const previousView = Object.keys(views).find(key => !views[key].classList.contains('hidden')) || 'setup';

    try {
        console.log(`Calling Gemini Proxy with prompt length: ${prompt.length}`);

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        });

        const data = await response.json();

        if (data.error) {
            console.error('Gemini API Error Detail:', JSON.stringify(data.error, null, 2));
            const msg = data.error.message || 'API Error';
            throw new Error(`${msg}${data.error.status ? ` (${data.error.status})` : ''}`);
        }

        if (data.choices && data.choices[0] && data.choices[0].message) {
            const text = data.choices[0].message.content;
            console.log('AI Response Received successfully');
            return text;
        }

        console.warn('Empty or invalid candidates in response:', data);
        throw new Error('AI failed to generate a response. Please try again.');

    } catch (error) {
        console.error('Critical AI Error:', error);
        alert(`API Error: ${error.message}`);

        // Revert to stable view
        showView(previousView);
        return null;
    }
}

function parseAIJSON(text) {
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        return JSON.parse(text);
    } catch (e) {
        console.error('Failed to parse AI JSON:', text);
        return null;
    }
}

async function generateProblem() {
    // State is already updated via card listeners

    showView('loading');
    document.getElementById('loading-text').textContent = `Initialising...`;
    stopTimer();
    resetState();

    // Problem generation logic

    // Update Meta Info
    document.getElementById('display-lang').textContent = currentLanguage.toUpperCase();
    document.getElementById('display-diff').textContent = currentDifficulty.toUpperCase();

    let problem;
    if (USE_DUMMY) {
        await new Promise(r => setTimeout(r, 1000));
        const modeProblems = DUMMY_PROBLEMS[currentMode] || DUMMY_PROBLEMS['challenge'];
        problem = modeProblems[currentLanguage] || modeProblems['javascript'];
    } else {
        const guideline = DIFFICULTY_GUIDELINES[currentDifficulty] || "";
        const settings = MODE_SETTINGS[currentDifficulty] || MODE_SETTINGS.Beginner;

        let promptSnippet = "";
        if (currentMode === 'challenge') {
            promptSnippet = `Return the response ONLY in valid JSON format with these exact keys:
            "title": "A short descriptive title",
            "description": "Clear explanation of the task, requirements, constraints, and 2-3 examples in HTML format.",
            "starterCode": "Initial boilerplate code for the user to start with."`;
        } else if (currentMode === 'multiple-choice') {
            promptSnippet = `Generate ${settings.questions} multiple choice questions. 
            Return the response ONLY in valid JSON format as an object with a "questions" key containing an array of objects. 
            Each object must have:
            "question": "The question text",
            "options": ["A", "B", "C", "D"],
            "answer": 0-3 (index of correct option)`;
        } else if (currentMode === 'fill-blanks') {
            promptSnippet = `Generate ${settings.questions} code snippets with 1-2 important parts missing. 
            Represent blanks as {{blank}}.
            Return the response ONLY in valid JSON format as an object with a "questions" key containing an array of objects.
            Each object must have:
            "title": "Short title",
            "code": "Code snippet with {{blank}}",
            "answers": ["correct_value_1", "correct_value_2"]`;
        }

        const prompt = `Act as a senior coding instructor. Mode: ${currentMode}. Level: ${currentDifficulty}. Language: ${currentLanguage}.
        
        Strict Guidelines for ${currentDifficulty} difficulty:
        ${guideline}

        Ensure the challenge is strictly appropriate for this level.
        
        ${promptSnippet}`;

        const result = await callGemini(prompt);
        if (!result) return;
        problem = parseAIJSON(result);
    }

    if (problem) {
        if (currentMode === 'challenge') {
            document.getElementById('coding-container').classList.remove('hidden');
            document.getElementById('quiz-container').classList.add('hidden');

            document.getElementById('problem-title').textContent = problem.title;
            document.getElementById('problem-content').innerHTML = problem.description;
            initEditor(currentLanguage, problem.starterCode);
        } else {
            document.getElementById('coding-container').classList.add('hidden');
            document.getElementById('quiz-container').classList.remove('hidden');

            quizQuestions = problem.questions || [];
            currentQuestionIndex = 0;
            userAnswers = new Array(quizQuestions.length).fill(null);
            renderQuizQuestion();
            startTimer();
        }

        showView('challenge');
        retryCount = 0; // Reset on success
    } else if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.warn(`Problem generation failed. Retry ${retryCount}/${MAX_RETRIES}`);
        generateProblem();
    } else {
        alert('Failed to generate a challenge after several attempts. Please try again later.');
        showView('setup');
        retryCount = 0;
    }
}

function renderQuizQuestion() {
    const question = quizQuestions[currentQuestionIndex];
    if (!question) return;

    // Update Progress
    const progress = ((currentQuestionIndex + 1) / quizQuestions.length) * 100;
    document.getElementById('quiz-progress-text').textContent = `Question ${currentQuestionIndex + 1} of ${quizQuestions.length}`;
    document.getElementById('progress-fill').style.width = `${progress}%`;

    // Update Question Area
    document.getElementById('quiz-question-title').textContent = question.title || (currentMode === 'multiple-choice' ? "Select the correct answer" : "Fill the missing parts");

    const contentArea = document.getElementById('quiz-question-content');
    const optionsArea = document.getElementById('quiz-options');
    optionsArea.innerHTML = '';

    if (currentMode === 'multiple-choice') {
        contentArea.textContent = question.question;
        question.options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = `option-btn ${userAnswers[currentQuestionIndex] === idx ? 'selected' : ''}`;
            btn.innerHTML = `<span class="option-letter">${String.fromCharCode(65 + idx)}</span> <span class="option-text">${opt}</span>`;
            btn.onclick = () => {
                userAnswers[currentQuestionIndex] = idx;
                renderQuizQuestion();
            };
            optionsArea.appendChild(btn);
        });
    } else if (currentMode === 'fill-blanks') {
        let codeWithInputs = question.code;
        // Simple logic to replace {{blank}} with inputs
        let blankIdx = 0;
        codeWithInputs = codeWithInputs.replace(/{{blank}}/g, () => {
            const val = (userAnswers[currentQuestionIndex] && userAnswers[currentQuestionIndex][blankIdx]) || '';
            const input = `<input type="text" class="blank-input" data-idx="${blankIdx}" value="${val}" placeholder="..." onchange="updateBlankAnswer(this)">`;
            blankIdx++;
            return input;
        });
        contentArea.innerHTML = `<pre><code>${codeWithInputs}</code></pre>`;
    }

    // Update Controls
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const submitBtn = document.getElementById('quiz-submit-btn');

    prevBtn.disabled = currentQuestionIndex === 0;

    if (currentQuestionIndex === quizQuestions.length - 1) {
        nextBtn.classList.add('hidden');
        submitBtn.classList.remove('hidden');
    } else {
        nextBtn.classList.remove('hidden');
        submitBtn.classList.add('hidden');
    }
}

function updateBlankAnswer(input) {
    const idx = parseInt(input.dataset.idx);
    if (!userAnswers[currentQuestionIndex]) userAnswers[currentQuestionIndex] = [];
    userAnswers[currentQuestionIndex][idx] = input.value;
}

// Add these to Global Init or Event Listeners
document.getElementById('next-btn').addEventListener('click', () => {
    if (currentQuestionIndex < quizQuestions.length - 1) {
        currentQuestionIndex++;
        renderQuizQuestion();
    }
});

document.getElementById('prev-btn').addEventListener('click', () => {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderQuizQuestion();
    }
});

document.getElementById('quiz-submit-btn').addEventListener('click', evaluateSolution);

async function evaluateSolution() {
    if (violationDetected) return;

    showView('loading');
    document.getElementById('loading-text').textContent = 'Processing assessment...';
    const finalTime = formatTime(currentMode === 'challenge' ? secondsElapsed : (MODE_SETTINGS[currentDifficulty].time - secondsRemaining));
    stopTimer();

    let evaluation;

    if (currentMode === 'challenge') {
        const userCode = editor.getValue();
        const problemTitle = document.getElementById('problem-title').textContent;
        const problemDesc = document.getElementById('problem-content').innerHTML;

        if (USE_DUMMY) {
            await new Promise(r => setTimeout(r, 1500));
            evaluation = DUMMY_EVALUATION;
        } else {
            const prompt = `Act as a strict technical interviewer. Evaluate the following ${currentLanguage} solution for the problem: "${problemTitle}".
            
            Rigorous Evaluation Criteria:
            1. Correctness: Does it solve all aspects of the problem? (40%)
            2. Efficiency: Is the time and space complexity optimal? (30%)
            3. Readability & Style: Is the code clean and well-structured? (20%)
            4. Edge Cases: Does it handle empty input, nulls, or boundary values? (10%)

            Problem Context: ${problemDesc}
            User Solution:
            ${userCode}

            Return the evaluation ONLY in valid JSON format with these exact keys:
            "score": (integer 0-100),
            "rating": "Stars representation based on score (0-20=★☆☆☆☆, 21-40=★★☆☆☆, 41-60=★★★☆☆, 61-80=★★★★☆, 81-100=★★★★★)",
            "feedback": "Concise technical summary of performance in HTML format.",
            "suggestions": ["List of 3 specific technical optimization tips or corrections in HTML format"]`;

            const result = await callGemini(prompt);
            if (!result) return;
            evaluation = parseAIJSON(result);
        }
    } else {
        // Evaluate Quiz (MCQ/Fill Blanks)
        const prompt = `Act as a strict technical examiner. Evaluate the user's answers for a ${currentMode} quiz in ${currentLanguage}.
        
        Quiz Data: ${JSON.stringify(quizQuestions)}
        User Answers: ${JSON.stringify(userAnswers)}

        Return the evaluation ONLY in valid JSON format with these exact keys:
        "score": (integer 0-100),
        "rating": "Stars representation",
        "feedback": "Summary of what they got right/wrong in HTML format.",
        "suggestions": ["Specific tips to improve in HTML format"]`;

        const result = await callGemini(prompt);
        if (!result) {
            alert('Evaluation failed. Please try submitting again.');
            showView('challenge');
            return;
        }
        evaluation = parseAIJSON(result);
    }

    if (evaluation) {
        document.getElementById('score-badge').textContent = `${evaluation.score}/100`;
        document.getElementById('rating-stars').textContent = evaluation.rating;
        document.getElementById('time-taken').textContent = finalTime;
        document.getElementById('feedback-content').innerHTML = evaluation.feedback;

        // Populate Language and Difficulty in Results
        document.getElementById('results-lang').textContent = currentLanguage.toUpperCase();
        document.getElementById('results-diff').textContent = currentDifficulty.toUpperCase();

        const statusEl = document.getElementById('completion-status');
        let status = "COMPLETED";
        let color = "var(--success)";

        if (evaluation.score >= 90) { status = "MASTERED"; color = "#10b981"; }
        else if (evaluation.score >= 70) { status = "PASSED"; color = "var(--primary)"; }
        else if (evaluation.score >= 40) { status = "DEVELOPING"; color = "var(--warning)"; }
        else { status = "RETRY NEEDED"; color = "var(--error)"; }

        statusEl.textContent = status;
        statusEl.style.color = color;

        const suggestionsList = document.getElementById('suggestions-content');
        if (Array.isArray(evaluation.suggestions)) {
            suggestionsList.innerHTML = evaluation.suggestions.map(s => `<div class="suggestion-item">${s}</div>`).join('');
        } else {
            suggestionsList.innerHTML = '<div class="suggestion-item">No specific suggestions provided.</div>';
        }

        showView('results');
    } else {
        alert('Evaluation failed. Please try submitting again.');
        showView('challenge');
    }
}

// Event Listeners
buttons.start.addEventListener('click', generateProblem);
buttons.submit.addEventListener('click', evaluateSolution);
buttons.restart.addEventListener('click', () => {
    stopTimer();
    resetState();
    showView('setup');
});
buttons.reset.addEventListener('click', () => {
    if (confirm('Reset current challenge?')) {
        generateProblem();
    }
});


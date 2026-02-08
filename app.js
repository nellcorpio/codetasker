const API_KEY = 'AIzaSyBBYTbeRWBHGvaqe1lu7bh5OImlpFP9B84';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${API_KEY}`;
const USE_DUMMY = false; // Toggle this to save tokens

const DUMMY_PROBLEMS = {
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
    Easy: "Basic loops, arrays, simple string manipulation, and standard mathematical functions.",
    Medium: "Multidimensional arrays, nested loops, basic data structures (sets, maps), and basic sorting/searching.",
    Hard: "Complex algorithms, custom classes/interfaces, memory management concepts, and performance optimization.",
    Expert: "Advanced system design, design patterns, complex concurrency/asynchrony, deep language-specific optimizations, and intricate algorithmic complexity."
};

// App State
let editor = null;
let currentLanguage = 'javascript';
let currentDifficulty = 'Beginner';
let violationDetected = false;
let timerStarted = false;
let timerInterval = null;
let secondsElapsed = 0;
let pasteCount = 0;

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
    timerInterval = setInterval(() => {
        secondsElapsed++;
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const formatted = formatTime(secondsElapsed);
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
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        const data = await response.json();
        if (data.candidates && data.candidates[0]) {
            return data.candidates[0].content.parts[0].text;
        }
        throw new Error('Invalid API response');
    } catch (error) {
        console.error('AI Error:', error);
        alert('An unexpected error occurred. Please try again.');
        showView('setup');
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

    if (components.timer) components.timer.textContent = '00:00';
    if (components.challengeTimer) components.challengeTimer.textContent = '00:00';
    timerStarted = false;
    secondsElapsed = 0;
    pasteCount = 0;

    // Update Meta Info
    document.getElementById('display-lang').textContent = currentLanguage.toUpperCase();
    document.getElementById('display-diff').textContent = currentDifficulty.toUpperCase();

    let problem;
    if (USE_DUMMY) {
        await new Promise(r => setTimeout(r, 1000));
        problem = DUMMY_PROBLEMS[currentLanguage] || DUMMY_PROBLEMS['javascript'];
    } else {
        const guideline = DIFFICULTY_GUIDELINES[currentDifficulty] || "";
        const prompt = `Act as a senior coding instructor. Generate a coding challenge for a ${currentDifficulty} level programmer in ${currentLanguage}.
        
        Strict Guidelines for ${currentDifficulty} difficulty:
        ${guideline}

        Ensure the challenge is strictly appropriate for this level. Not too easy, not too complex.
        
        Return the response ONLY in valid JSON format with these exact keys:
        "title": "A short descriptive title",
        "description": "Clear explanation of the task, requirements, constraints, and 2-3 examples in HTML format.",
        "starterCode": "Initial boilerplate code for the user to start with."`;

        const result = await callGemini(prompt);
        if (!result) return;
        problem = parseAIJSON(result);
    }

    if (problem) {
        document.getElementById('problem-title').textContent = problem.title;
        document.getElementById('problem-content').innerHTML = problem.description;

        initEditor(currentLanguage, problem.starterCode);
        showView('challenge');
    } else {
        generateProblem();
    }
}

async function evaluateSolution() {
    if (violationDetected) return;

    const userCode = editor.getValue();
    const problemTitle = document.getElementById('problem-title').textContent;
    const problemDesc = document.getElementById('problem-content').innerHTML;

    showView('loading');
    document.getElementById('loading-text').textContent = 'Processing assessment...';
    const finalTime = formatTime(secondsElapsed);
    stopTimer();

    let evaluation;
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
        "suggestions": ["List of 3 specific technical optimization tips or corrections in HTML format (e.g. <b>Tip:</b> ...)"]`;

        const result = await callGemini(prompt);
        if (!result) return;
        evaluation = parseAIJSON(result);
    }

    if (evaluation) {
        document.getElementById('score-badge').textContent = `${evaluation.score}/100`;
        document.getElementById('rating-stars').textContent = evaluation.rating;
        document.getElementById('time-taken').textContent = finalTime;
        document.getElementById('feedback-content').innerHTML = evaluation.feedback;

        // Dynamic Status Logic
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
        suggestionsList.innerHTML = evaluation.suggestions.map(s => `<div class="suggestion-item">${s}</div>`).join('');

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
    showView('setup');
});
buttons.reset.addEventListener('click', () => {
    if (confirm('Reset current challenge?')) {
        generateProblem();
    }
});




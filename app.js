// --- Global State & Configuration ---
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE"; 
let patientQueue = JSON.parse(localStorage.getItem('patientQueue')) || [];

// --- DOM Elements ---
const form = document.getElementById('triage-form');
const connectionStatus = document.getElementById('connection-status');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const queueList = document.getElementById('queue-list');
const queueCount = document.getElementById('queue-count');
const emptyState = document.getElementById('empty-state');

// --- Online / Offline Status Detection ---
function updateOnlineStatus() {
    if (navigator.onLine) {
        connectionStatus.className = "flex items-center gap-2 text-sm bg-emerald-700 px-3 py-1 rounded-full";
        statusDot.className = "w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse";
        statusText.textContent = "Online";
        syncQueueWithAI();
    } else {
        connectionStatus.className = "flex items-center gap-2 text-sm bg-amber-700 px-3 py-1 rounded-full";
        statusDot.className = "w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping";
        statusText.textContent = "Offline (Local Mode)";
    }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// --- Offline Rule-Based Triage ---
function calculateOfflineTriage(symptomsText, age) {
    const criticalKeywords = ["chest pain", "breathing", "unconscious", "stroke", "bleeding", "accident", "seizure", "heart"];
    const moderateKeywords = ["fever", "vomiting", "pain", "fracture", "cough"];
    const text = symptomsText.toLowerCase();
    
    for (let keyword of criticalKeywords) {
        if (text.includes(keyword)) {
            return { level: "Red (Priority 1)", color: "text-red-600 bg-red-50 border-red-200", reason: "Critical symptoms identified offline." };
        }
    }
    for (let keyword of moderateKeywords) {
        if (text.includes(keyword)) {
            return { level: "Yellow (Priority 2)", color: "text-amber-600 bg-amber-50 border-amber-200", reason: "Moderate symptoms detected offline." };
        }
    }
    return { level: "Green (Priority 3)", color: "text-emerald-600 bg-emerald-50 border-emerald-200", reason: "Routine/Minor cases." };
}

// --- Render Queue ---
function renderQueue() {
    queueList.innerHTML = '';
    if (patientQueue.length === 0) {
        queueList.appendChild(emptyState);
        queueCount.textContent = "0 Cases";
        return;
    }
    queueCount.textContent = `${patientQueue.length} Cases`;
    
    patientQueue.forEach((patient, index) => {
        const card = document.createElement('div');
        card.className = `p-4 rounded-xl border flex flex-col gap-2 bg-white shadow-sm transition hover:shadow-md`;
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="font-bold text-slate-900">${patient.name} (${patient.age}y / ${patient.gender})</h3>
                    <p class="text-xs text-slate-400">ID: ${patient.id}</p>
                </div>
                <span class="text-xs font-semibold px-2.5 py-1 rounded-full border ${patient.triage.color}">
                    ${patient.triage.level}
                </span>
            </div>
            <div class="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <strong>Symptoms:</strong> ${patient.symptoms}
                ${patient.vitals ? `<br><strong>Vitals:</strong> ${patient.vitals}` : ''}
            </div>
            <div class="text-[11px] text-slate-500 italic">
                <strong>Decision Basis:</strong> ${patient.triage.reason}
            </div>
            <div class="flex justify-end gap-2 mt-1">
                <button onclick="deleteCase(${index})" class="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1">Delete</button>
            </div>
        `;
        queueList.appendChild(card);
    });
}

// --- Form Submission ---
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('patient-name').value;
    const age = document.getElementById('patient-age').value;
    const gender = document.getElementById('patient-gender').value;
    const vitals = document.getElementById('vitals').value;
    const symptoms = document.getElementById('symptoms').value;
    
    const localTriage = calculateOfflineTriage(symptoms, age);
    const newPatient = {
        id: "SZ-" + Math.floor(1000 + Math.random() * 9000),
        name, age, gender, vitals, symptoms,
        triage: localTriage,
        synced: false
    };
    
    patientQueue.unshift(newPatient);
    localStorage.setItem('patientQueue', JSON.stringify(patientQueue));
    renderQueue();
    form.reset();
    
    if (navigator.onLine) {
        syncQueueWithAI();
    }
});

// --- Delete Case ---
window.deleteCase = function(index) {
    patientQueue.splice(index, 1);
    localStorage.setItem('patientQueue', JSON.stringify(patientQueue));
    renderQueue();
};

// --- Online AI Sync ---
async function syncQueueWithAI() {
    const unsyncedPatients = patientQueue.filter(p => !p.synced);
    if (unsyncedPatients.length === 0 || GEMINI_API_KEY === "YOUR_API_KEY_HERE") return;
    
    for (let patient of unsyncedPatients) {
        try {
            const prompt = `Act as a clinical triage assistant. Analyze: Name: ${patient.name}, Age: ${patient.age}, Symptoms: ${patient.symptoms}. Classify strictly as: Red (Priority 1), Yellow (Priority 2), Green (Priority 3). Output JSON: {"level": "Red/Yellow/Green", "reason": "concise reason"}`;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            const responseText = data.candidates[0].content.parts[0].text;
            const cleanJson = JSON.parse(responseText.substring(responseText.indexOf('{'), responseText.lastIndexOf('}') + 1));
            
            let color = "text-emerald-600 bg-emerald-50 border-emerald-200";
            if (cleanJson.level.includes("Red") || cleanJson.level.includes("1")) color = "text-red-600 bg-red-50 border-red-200";
            else if (cleanJson.level.includes("Yellow") || cleanJson.level.includes("2")) color = "text-amber-600 bg-amber-50 border-amber-200";

            patient.triage = { level: `✨ AI: ${cleanJson.level}`, color, reason: cleanJson.reason };
            patient.synced = true;
            localStorage.setItem('patientQueue', JSON.stringify(patientQueue));
            renderQueue();
        } catch (error) {
            console.error(error);
        }
    }
}

updateOnlineStatus();

const firebaseConfig = {
    apiKey: "AIzaSyBQuGUV1A7esCJRkPhcAP6i2UStvdJw-Zg",
    authDomain: "pkpd-database.firebaseapp.com",
    databaseURL: "https://pkpd-database-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "pkpd-database",
    storageBucket: "pkpd-database.firebasestorage.app",
    messagingSenderId: "280364999020",
    appId: "1:280364999020:web:f565467add14c0c4851349",
    measurementId: "G-BDGVRP0DJM"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();


let currentLang = 'en'; 


let currentDevice = null;
let currentDeviceName = "";
let scoreChart = null;
let scores = [];
let allChatLogs = [];      
let currentRawState = null; 


const stateMap = {
    "待機中": { en: "Standby", "zh-hk": "待機中" },
    "遊戲中": { en: "Playing", "zh-hk": "遊戲中" },
    "idle": { en: "Idle", "zh-hk": "待機中" },
    "active": { en: "Active", "zh-hk": "遊戲中" },
    "standby": { en: "Standby", "zh-hk": "待機中" },
    "playing": { en: "Playing", "zh-hk": "遊戲中" }
};


function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function getRoleClass(role) {
    if (role.includes('護理師') || role.includes('Nurse')) return 'nurse';
    if (role.includes('醫師') || role.includes('Doctor')) return 'doctor';
    if (role.includes('復健師') || role.includes('Therapist')) return 'therapist';
    if (role.includes('家屬') || role.includes('Family')) return 'family';
    return 'default';
}


function getRoleDisplayName(role) {
    const t = window.translations[currentLang];
    if (!t) return role;
    if (role === 'Nurse' || role === '護理師') return t.roleNurse;
    if (role === 'Doctor' || role === '主治醫師') return t.roleDoctor;
    if (role === 'Therapist' || role === '復健師') return t.roleTherapist;
    if (role === 'Family' || role === '家屬') return t.roleFamily;
    return role;
}

function updateStateDisplay() {
    const statusEl = document.getElementById('connectionStatus');
    const t = window.translations[currentLang];
    if (currentRawState) {
        
        let displayState = currentRawState;
        if (stateMap[currentRawState] && stateMap[currentRawState][currentLang]) {
            displayState = stateMap[currentRawState][currentLang];
        }
        statusEl.textContent = displayState;
        statusEl.className = "status-online";
    } else {
        
        statusEl.textContent = t.waitingData;
        statusEl.className = "status-offline";
    }
}


function renderChatMessages() {
    const chatBox = document.getElementById('chatHistory');
    chatBox.innerHTML = '';
    const t = window.translations[currentLang];

    if (!allChatLogs || allChatLogs.length === 0) {
        chatBox.innerHTML = `<div class="chat-placeholder">${t.noLogs}</div>`;
        return;
    }

    
    const sorted = [...allChatLogs].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    sorted.forEach(log => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message role-${getRoleClass(log.role)}`;
        const displayRole = getRoleDisplayName(log.role);
        msgDiv.innerHTML = `
            <div class="msg-header">
                <span class="msg-role">${displayRole}</span>
                <span class="msg-time">${log.time}</span>
            </div>
            <div class="msg-content">${escapeHtml(log.text)}</div>
        `;
        chatBox.appendChild(msgDiv);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
}


function changeLanguage() {
    
    currentLang = currentLang === 'en' ? 'zh-hk' : 'en';
    
    
    const t = window.translations[currentLang];
    if (!t) {
        console.error("Missing translation pack for: " + currentLang);
        return;
    }
    
    
    document.getElementById('langBtn').textContent = currentLang === 'en' ? '🌐 English' : '🌐 中文';
    

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) {
            el.textContent = t[key];
        }
    });

    
    document.querySelectorAll('#noteRole option').forEach(opt => {
        const key = opt.getAttribute('data-i18n');
        if (key && t[key]) opt.textContent = t[key];
    });

    
    document.getElementById('sysMsgInput').placeholder = t.inputPlaceholder;

    
    renderChatMessages();

    
    updateDashboard();

    
    updateStateDisplay();
}


document.getElementById('langBtn').addEventListener('click', changeLanguage);


function initChart() {
    const ctx = document.getElementById('scoreChart').getContext('2d');
    if(scoreChart) scoreChart.destroy();
    scoreChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Score', data: [], borderColor: '#0277bd', backgroundColor: 'rgba(2,119,189,0.1)', borderWidth: 2, fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }
    });
}


function loadDevices() {
    const deviceList = document.getElementById('deviceList');
    const t = window.translations[currentLang];
    database.ref('devices').on('value', (snapshot) => {
        const data = snapshot.val();
        deviceList.innerHTML = ''; 
        if (!data) { deviceList.innerHTML = `<div class="loading">${t.searchingDev}</div>`; return; }

        Object.keys(data).forEach(mac => {
            const btn = document.createElement('div');
            btn.className = 'device-chip' + (currentDevice === mac ? ' active' : '');
            const name = data[mac].info?.name || mac;
            btn.innerHTML = `📡 ${name}`;
            btn.onclick = () => selectDevice(mac, name);
            deviceList.appendChild(btn);
        });
        if (!currentDevice && Object.keys(data).length > 0) {
            const firstKey = Object.keys(data)[0];
            selectDevice(firstKey, data[firstKey].info?.name || firstKey);
        }
    });
}

function selectDevice(deviceId, deviceName) {
    if (currentDevice) {
        database.ref(`devices/${currentDevice}/sessions`).off();
        database.ref(`statistics/${currentDevice}`).off();
        database.ref(`devices/${currentDevice}/status/difficulty`).off();
        database.ref(`devices/${currentDevice}/realtime/state`).off();
    }
    currentDevice = deviceId;
    currentDeviceName = deviceName; 
    
    document.getElementById('remoteControls').style.display = 'flex';
    document.getElementById('reportBtn').style.display = 'block';

    document.querySelectorAll('.device-chip').forEach(el => {
        el.classList.remove('active');
        if(el.innerText.includes(deviceId) || el.innerText.includes(deviceName)) el.classList.add('active');
    });

    database.ref(`devices/${deviceId}/status/difficulty`).on('value', (snapshot) => {
        const val = snapshot.val();
        const badge = document.getElementById('currentDiff');
        if (val === 0) badge.textContent = "Easy";
        else if (val === 1) badge.textContent = "Hard";
        else if (val === 2) badge.textContent = "Auto";
        else badge.textContent = "Unknown";
    });

    
    database.ref(`devices/${deviceId}/realtime/state`).on('value', (snapshot) => {
        const state = snapshot.val();
        currentRawState = state;
        updateStateDisplay();
    });

    database.ref(`statistics/${deviceId}`).on('value', (snapshot) => {
        const stats = snapshot.val() || {};
        document.getElementById('totalGames').textContent = stats.totalGames || 0;
        document.getElementById('highScore').textContent = stats.highScore || 0;
    });

    database.ref(`devices/${deviceId}/sessions`).orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
        const data = snapshot.val();
        const t = window.translations[currentLang];
        if (!data) { 
            document.getElementById('recordsBody').innerHTML = `<tr><td colspan="5" class="loading">${t.noLogs}</td></tr>`; 
            scores = [];
            return; 
        }
        scores = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
        updateDashboard();
    });
}


function updateDashboard() {
    const tbody = document.getElementById('recordsBody');
    tbody.innerHTML = '';
    const t = window.translations[currentLang];
    
    if (scores.length > 0) {
        const latest = scores[0];
        document.getElementById('latestScore').textContent = latest.score;
        let modeStr = latest.mode === 'memory' ? t.modeMem : t.modeCnt;
        document.getElementById('latestMode').textContent = modeStr;
        document.getElementById('latestTime').textContent = new Date(latest.timestamp * 1000).toLocaleTimeString();
    }

    scores.forEach(record => {
        const row = tbody.insertRow();
        const date = record.timestamp ? new Date(record.timestamp * 1000) : new Date();
        let modeLabel = record.mode === 'memory' ? t.modeMem : t.modeCnt;
        row.innerHTML = `<td>${date.toLocaleString()}</td><td><span class="mode-badge">${modeLabel}</span></td><td><span class="score-badge">${record.score}</span></td><td>${record.duration}s</td><td style="font-family: monospace; font-size: 0.8em; color:#999;">${record.sessionID || '-'}</td>`;
    });

    if (scoreChart) {
        const chartData = scores.slice(0, 10).reverse(); 
        scoreChart.data.labels = chartData.map(d => new Date(d.timestamp*1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}));
        scoreChart.data.datasets[0].data = chartData.map(d => d.score);
        scoreChart.update();
    }
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
}


function setDifficulty(level) {
    if (!currentDevice) return;
    const cmdStatus = document.getElementById('cmdStatus');
    cmdStatus.textContent = "...";
    database.ref(`devices/${currentDevice}/control/difficulty`).set(level)
        .then(() => { cmdStatus.textContent = "OK"; setTimeout(() => { cmdStatus.textContent = ""; }, 3000); })
        .catch((e) => { cmdStatus.textContent = "Fail"; console.error(e); });
}


function initChatSystem() {
    const noteInput = document.getElementById('sysMsgInput');
    const sendBtn = document.getElementById('sendMsgBtn');

    
    database.ref('nursing_logs').on('value', (snapshot) => {
        const logs = snapshot.val();
        allChatLogs = []; 
        const t = window.translations[currentLang];

        if (!logs) {
            renderChatMessages(); 
            return;
        }

        Object.values(logs).forEach(log => {
            allChatLogs.push(log);
        });
        renderChatMessages();
    });

    
    sendBtn.onclick = () => {
        const text = noteInput.value.trim();
        let role = document.getElementById('noteRole').value; 

        if (!text) return;

        sendBtn.disabled = true;
        database.ref('nursing_logs').push({
            role: role,            
            text: text,
            time: new Date().toLocaleString()
        }).then(() => {
            noteInput.value = '';
            sendBtn.disabled = false;
        }).catch(e => {
            console.error(e);
            alert("Error");
            sendBtn.disabled = false;
        });
    };
}


function analyzeAndGenerateReport() {
    const t = window.translations[currentLang];

    
    document.querySelector('.report-title-section h2').textContent = 
        currentLang === 'en' ? "Memory Bloom Cognitive Function Report" : "Memory Bloom 認知功能追蹤報告";
    document.querySelector('.report-title-section p').textContent = 
        currentLang === 'en' ? "Cognitive Function Monitoring Report" : "認知功能監測報告";

    document.getElementById('rpt-device-name').textContent = currentDeviceName || currentDevice;
    document.getElementById('rpt-date').textContent = new Date().toLocaleString();
    document.getElementById('rpt-sample-count').textContent = scores.length;
    
    
    const rptList = document.getElementById('rpt-note-list');
    rptList.innerHTML = '';
    if (allChatLogs.length > 0) {
        
        const sorted = [...allChatLogs].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        sorted.forEach(log => {
            const li = document.createElement('li');
            
            const displayRole = getRoleDisplayName(log.role);
            li.innerHTML = `<strong>${displayRole}</strong> (${log.time}): ${escapeHtml(log.text)}`;
            rptList.appendChild(li);
        });
    } else {
        rptList.innerHTML = `<li style="font-style:italic;">${t.noLogs}</li>`;
    }

    
    const recentGames = scores.slice(0, 5);
    const avgRecent = recentGames.reduce((sum, s) => sum + parseInt(s.score), 0) / recentGames.length;
    
    let avgOld = 0;
    let hasHistory = false;
    if (scores.length > 10) {
        const oldGames = scores.slice(5, 10);
        avgOld = oldGames.reduce((sum, s) => sum + parseInt(s.score), 0) / oldGames.length;
        hasHistory = true;
    }

    let summaryText = `${t.rptSummaryStart}${scores.length}${t.rptSummaryMid}${avgRecent.toFixed(1)}.`;
    let suggestions = [];

    if (hasHistory) {
        if (avgRecent > avgOld * 1.1) {
            summaryText += `${t.rptProgress}${((avgRecent - avgOld)/avgOld*100).toFixed(0)}%).`;
            suggestions.push(t.rptProgressSugg1);
            suggestions.push(t.rptProgressSugg2);
        } else if (avgRecent < avgOld * 0.9) {
            summaryText += t.rptDecline;
            suggestions.push(t.rptDeclineSugg1);
            suggestions.push(t.rptDeclineSugg2);
        } else {
            summaryText += t.rptStable;
            suggestions.push(t.rptStableSugg1);
            suggestions.push(t.rptStableSugg2);
        }
    } else {
        summaryText += t.rptBaseline;
        suggestions.push(t.rptBaselineSugg);
    }

    const lastGame = scores[0];
    if (lastGame && lastGame.score < 2) { 
        suggestions.push(t.rptLowScore);
    }

    document.getElementById('rpt-summary-text').textContent = summaryText;
    
    const ul = document.getElementById('rpt-suggestions');
    ul.innerHTML = "";
    suggestions.forEach(s => {
        const li = document.createElement('li');
        li.textContent = s;
        ul.appendChild(li);
    });
}


window.openReportModal = function() {
    analyzeAndGenerateReport();                 
    document.getElementById('reportModal').style.display = 'flex';
};

window.closeReportModal = function() {
    document.getElementById('reportModal').style.display = 'none';
};

function downloadPDF() {
    const element = document.getElementById('printableArea');
    const opt = {
        margin:       10,
        filename:     `MemoryBloom_Report_${new Date().toISOString().slice(0,10)}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    const btn = document.querySelector('.btn-download');
    const originalText = btn.textContent;
    btn.textContent = "⏳ ...";
    
    html2pdf().set(opt).from(element).save().then(() => {
        btn.textContent = originalText;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    initChatSystem();
    loadDevices();
    document.getElementById('langBtn').textContent = '🌐 English';
});

// 1. Firebase 配置
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

// --- 國際化 (i18n) 設定 ---
let currentLang = 'en'; // 預設英文

// 輔助：安全獲取翻譯物件
function getTranslations() {
    if (!window.translations || !window.translations[currentLang]) {
        console.error(`❌ 嚴重錯誤：找不到語言包 (${currentLang})！請檢查 index.html 是否正確引入了 en.js 和 zh-hk.js`);
        alert("System Error: Language pack not found. Please check console.\n系統錯誤：找不到語言包，請檢查代碼設定。");
        return null; // 回傳 null 表示失敗
    }
    return window.translations[currentLang];
}

// 語言切換功能
function changeLanguage() {
    currentLang = currentLang === 'en' ? 'zh-hk' : 'en';
    const t = getTranslations();
    if (!t) return; // 如果沒翻譯檔，就停止執行避免報錯
    
    // 1. 更新按鈕文字
    const btn = document.getElementById('langBtn');
    if(btn) btn.textContent = currentLang === 'en' ? '🌐 中文' : '🌐 English';
    
    // 2. 更新所有帶有 data-i18n 的元素
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) {
            el.textContent = t[key];
        }
    });

    // 3. 更新輸入框 Placeholder
    const input = document.getElementById('sysMsgInput');
    if(input) input.placeholder = t.inputPlaceholder;

    // 4. 更新 JS 動態生成的內容
    updateDashboard(); 
    refreshChatLogs(); 
}

function refreshChatLogs() {
    const chatBox = document.getElementById('chatHistory');
    if(!chatBox) return;
    
    chatBox.innerHTML = ''; 
    const t = getTranslations();
    if (!t) return;

    database.ref('nursing_logs').once('value').then(snapshot => {
         const logs = snapshot.val();
         if (!logs) {
            chatBox.innerHTML = `<div class="chat-placeholder">${t.noLogs}</div>`;
            return;
         }
         Object.values(logs).forEach(log => {
             let displayRole = log.role;
             if(currentLang === 'en') {
                 if(log.role === '護理師') displayRole = 'Nurse';
                 if(log.role === '主治醫師') displayRole = 'Doctor';
                 if(log.role === '復健師') displayRole = 'Therapist';
                 if(log.role === '家屬') displayRole = 'Family';
             } else {
                 if(log.role === 'Nurse') displayRole = '護理師';
                 if(log.role === 'Doctor') displayRole = '主治醫師';
                 if(log.role === 'Therapist') displayRole = '復健師';
                 if(log.role === 'Family') displayRole = '家屬';
             }

             const msgDiv = document.createElement('div');
             msgDiv.className = `chat-message role-${getRoleClass(log.role)}`;
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
    });
}

// 綁定按鈕事件 (加了安全檢查，防止按鈕不存在時報錯)
const langBtn = document.getElementById('langBtn');
if(langBtn) langBtn.addEventListener('click', changeLanguage);


let currentDevice = null;
let currentDeviceName = "";
let scoreChart = null;
let scores = [];
let allChatLogs = []; 

function initChatSystem() {
    const chatBox = document.getElementById('chatHistory');
    const noteInput = document.getElementById('sysMsgInput');
    const sendBtn = document.getElementById('sendMsgBtn');
    const roleSelect = document.getElementById('noteRole');

    database.ref('nursing_logs').on('value', (snapshot) => {
        if(!chatBox) return;
        chatBox.innerHTML = ''; 
        allChatLogs = []; 
        
        const logs = snapshot.val();
        const t = getTranslations();
        if (!t) return;

        if (!logs) {
            chatBox.innerHTML = `<div class="chat-placeholder">${t.noLogs}</div>`;
            return;
        }

        Object.values(logs).forEach(log => {
            allChatLogs.push(log);
            const msgDiv = document.createElement('div');
            msgDiv.className = `chat-message role-${getRoleClass(log.role)}`;
            
            let displayRole = log.role;
            if (currentLang === 'en') {
                if(log.role === '護理師') displayRole = 'Nurse';
                if(log.role === '主治醫師') displayRole = 'Doctor';
                if(log.role === '復健師') displayRole = 'Therapist';
                if(log.role === '家屬') displayRole = 'Family';
            }

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
    });

    if(sendBtn) {
        sendBtn.onclick = () => {
            const text = noteInput.value.trim();
            let role = roleSelect.options[roleSelect.selectedIndex].text; 
            role = role.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27FF]/g, "").trim(); 

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
}

function getRoleClass(role) {
    if(!role) return 'default';
    if (role.includes('護理師') || role.includes('Nurse')) return 'nurse';
    if (role.includes('醫師') || role.includes('Doctor')) return 'doctor';
    if (role.includes('復健師') || role.includes('Therapist')) return 'therapist';
    if (role.includes('家屬') || role.includes('Family')) return 'family';
    return 'default';
}

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function setDifficulty(level) {
    if (!currentDevice) return;
    const cmdStatus = document.getElementById('cmdStatus');
    if(cmdStatus) cmdStatus.textContent = "...";
    database.ref(`devices/${currentDevice}/control/difficulty`).set(level)
        .then(() => { if(cmdStatus) { cmdStatus.textContent = "OK"; setTimeout(() => { cmdStatus.textContent = ""; }, 3000); } })
        .catch((e) => { if(cmdStatus) cmdStatus.textContent = "Fail"; console.error(e); });
}

function initChart() {
    const ctxEl = document.getElementById('scoreChart');
    if(!ctxEl) return;
    const ctx = ctxEl.getContext('2d');
    
    if(scoreChart) scoreChart.destroy();
    scoreChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Score', data: [], borderColor: '#0277bd', backgroundColor: 'rgba(2,119,189,0.1)', borderWidth: 2, fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }
    });
}

function loadDevices() {
    const deviceList = document.getElementById('deviceList');
    database.ref('devices').on('value', (snapshot) => {
        const data = snapshot.val();
        deviceList.innerHTML = ''; 
        
        const t = getTranslations();
        // 這裡做個小容錯，如果還沒讀到翻譯，先顯示英文Loading
        const loadingText = t ? t.searchingDev : "Loading...";
        
        if (!data) { deviceList.innerHTML = `<div class="loading">${loadingText}</div>`; return; }

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
        if(badge) {
            if (val === 0) badge.textContent = "Easy";
            else if (val === 1) badge.textContent = "Hard";
            else if (val === 2) badge.textContent = "Auto";
            else badge.textContent = "Unknown";
        }
    });

    database.ref(`devices/${deviceId}/realtime/state`).on('value', (snapshot) => {
        const state = snapshot.val();
        if (state) {
            const statusEl = document.getElementById('connectionStatus');
            if(statusEl) {
                statusEl.textContent = state;
                statusEl.className = "status-online";
            }
        }
    });

    database.ref(`statistics/${deviceId}`).on('value', (snapshot) => {
        const stats = snapshot.val() || {};
        document.getElementById('totalGames').textContent = stats.totalGames || 0;
        document.getElementById('highScore').textContent = stats.highScore || 0;
    });

    database.ref(`devices/${deviceId}/sessions`).orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
        const data = snapshot.val();
        const t = getTranslations();
        // 容錯處理
        const noLogText = t ? t.noLogs : "No records";
        
        if (!data) { 
            document.getElementById('recordsBody').innerHTML = `<tr><td colspan="5" class="loading">${noLogText}</td></tr>`; 
            scores = [];
            return; 
        }
        scores = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
        updateDashboard();
    });
}

function updateDashboard() {
    const tbody = document.getElementById('recordsBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const t = getTranslations();
    if(!t) return;

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
    const lastUpdateEl = document.getElementById('lastUpdate');
    if(lastUpdateEl) lastUpdateEl.textContent = new Date().toLocaleTimeString();
}

function analyzeAndGenerateReport() {
    // 這裡就是最容易出錯的地方！如果沒有 t，這裡就會報錯
    const t = getTranslations();
    if (!t) return; // 沒翻譯就別執行了

    // 標題翻譯
    const titleEl = document.querySelector('.report-title-section h2');
    const subtitleEl = document.querySelector('.report-title-section p');
    
    if(titleEl) titleEl.textContent = currentLang === 'en' ? "Memory Bloom Cognitive Function Report" : "Memory Bloom 認知功能追蹤報告";
    if(subtitleEl) subtitleEl.textContent = "Cognitive Function Monitoring Report";

    document.getElementById('rpt-device-name').textContent = currentDeviceName || currentDevice;
    document.getElementById('rpt-date').textContent = new Date().toLocaleString();
    document.getElementById('rpt-sample-count').textContent = scores.length;
    
    const rptList = document.getElementById('rpt-note-list');
    rptList.innerHTML = '';
    if (allChatLogs.length > 0) {
        const recentLogs = allChatLogs.slice(-3).reverse();
        recentLogs.forEach(log => {
            const li = document.createElement('li');
            let displayRole = log.role;
            li.innerHTML = `<strong>${displayRole}</strong> (${log.time}): ${log.text}`;
            rptList.appendChild(li);
        });
    } else {
        rptList.innerHTML = `<li style="font-style:italic;">${t.noLogs}</li>`;
    }

    const recentGames = scores.slice(0, 5);
    // 防止除以 0 導致 NaN
    const avgRecent = recentGames.length > 0 ? (recentGames.reduce((sum, s) => sum + parseInt(s.score), 0) / recentGames.length) : 0;
    
    let avgOld = 0;
    let hasHistory = false;
    if (scores.length > 10) {
        const oldGames = scores.slice(5, 10);
        // 防止除以 0
        if(oldGames.length > 0) {
            avgOld = oldGames.reduce((sum, s) => sum + parseInt(s.score), 0) / oldGames.length;
            hasHistory = true;
        }
    }

    let summaryText = `${t.rptSummaryStart}${scores.length}${t.rptSummaryMid}${avgRecent.toFixed(1)}.`;
    let suggestions = [];

    if (hasHistory) {
        if (avgRecent > avgOld * 1.1) {
            // 防止 avgOld 為 0 導致 Infinity
            let improvement = avgOld > 0 ? ((avgRecent - avgOld)/avgOld*100).toFixed(0) : "100";
            summaryText += `${t.rptProgress}${improvement}%).`;
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

    if (scores.length > 0) {
        const lastGame = scores[0];
        if (lastGame.score < 2) { 
            suggestions.push(t.rptLowScore);
        }
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

function openReportModal() {
    if (!currentDevice || scores.length === 0) {
        // 這裡也可以加上翻譯
        alert("Please select a device and ensure there is data.\n請先選擇設備，且確保有遊玩記錄。");
        return;
    }
    analyzeAndGenerateReport();
    document.getElementById('reportModal').style.display = 'flex';
}

function closeReportModal() {
    document.getElementById('reportModal').style.display = 'none';
}

function downloadPDF() {
    if(typeof html2pdf === 'undefined') {
        alert("Error: html2pdf library not loaded.");
        return;
    }

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
    }).catch(err => {
        console.error(err);
        btn.textContent = originalText;
        alert("PDF Generation Failed.");
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    initChatSystem();
    loadDevices();
});

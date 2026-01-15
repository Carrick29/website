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

let currentDevice = null;
let scoreChart = null;
let scores = [];

// --- 護理備註功能 (WhatsApp Style) ---
function initNoteBoard() {
    const noteInput = document.getElementById('sysMsgInput');
    const roleInput = document.getElementById('roleInput');
    const saveBtn = document.getElementById('sendMsgBtn');
    const chatHistory = document.getElementById('chatHistory');
    const statusText = document.getElementById('currentMsg');

    // 監聽 Firebase 數據變化
    database.ref('system_note').on('value', (snapshot) => {
        const data = snapshot.val();
        chatHistory.innerHTML = ''; 
        
        if (data) {
            Object.keys(data).forEach(key => {
                const msg = data[key];
                const msgDiv = document.createElement('div');
                msgDiv.className = 'message-bubble';
                msgDiv.innerHTML = `
                    <div class="message-role">${msg.role || '系統'}</div>
                    <div class="message-text">${msg.text}</div>
                    <div class="message-time">${msg.time}</div>
                `;
                chatHistory.appendChild(msgDiv);
            });
            // 自動捲動到底部
            chatHistory.scrollTop = chatHistory.scrollHeight;
        } else {
            chatHistory.innerHTML = '<div class="loading">尚無對話紀錄</div>';
        }
    });

    // 發送按鈕
    saveBtn.onclick = () => {
        const text = noteInput.value.trim();
        const role = roleInput.value.trim() || "未命名角色";
        
        if (!text) return;

        const now = new Date().toLocaleString('zh-TW', { hour12: false });
        saveBtn.disabled = true;

        database.ref('system_note').push({
            role: role,
            text: text,
            time: now
        }).then(() => {
            saveBtn.disabled = false;
            noteInput.value = ""; // 清空輸入區
            statusText.textContent = "已發送: " + now;
        });
    };
}

// --- 設備控制 ---
function setDifficulty(level) {
    if (!currentDevice) return;
    const cmdStatus = document.getElementById('cmdStatus');
    cmdStatus.textContent = "發送中...";
    database.ref(`devices/${currentDevice}/control/difficulty`).set(level)
        .then(() => { cmdStatus.textContent = "✅ 已同步"; setTimeout(() => { cmdStatus.textContent = ""; }, 3000); })
}

// --- 圖表初始化 ---
function initChart() {
    const ctx = document.getElementById('scoreChart').getContext('2d');
    if(scoreChart) scoreChart.destroy();
    scoreChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: '分數', data: [], borderColor: '#0277bd', backgroundColor: 'rgba(2,119,189,0.1)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// --- 讀取設備列表 ---
function loadDevices() {
    const deviceList = document.getElementById('deviceList');
    database.ref('devices').on('value', (snapshot) => {
        const data = snapshot.val();
        deviceList.innerHTML = ''; 
        if (!data) return;
        Object.keys(data).forEach(mac => {
            const btn = document.createElement('div');
            btn.className = 'device-chip' + (currentDevice === mac ? ' active' : '');
            const name = data[mac].info?.name || mac;
            btn.innerHTML = `📡 ${name}`;
            btn.onclick = () => selectDevice(mac);
            deviceList.appendChild(btn);
        });
        if (!currentDevice && Object.keys(data).length > 0) selectDevice(Object.keys(data)[0]);
    });
}

// --- 選擇特定設備 ---
function selectDevice(deviceId) {
    if (currentDevice) {
        database.ref(`devices/${currentDevice}/sessions`).off();
        database.ref(`statistics/${currentDevice}`).off();
        database.ref(`devices/${currentDevice}/status/difficulty`).off();
        database.ref(`devices/${currentDevice}/realtime/state`).off();
    }
    currentDevice = deviceId;
    document.getElementById('remoteControls').style.display = 'flex';
    
    // 更新 UI 狀態
    database.ref(`devices/${deviceId}/status/difficulty`).on('value', (snapshot) => {
        const val = snapshot.val();
        const badge = document.getElementById('currentDiff');
        const labels = ["Easy", "Hard", "Auto"];
        badge.textContent = labels[val] || "Unknown";
    });

    database.ref(`devices/${deviceId}/realtime/state`).on('value', (snapshot) => {
        const state = snapshot.val();
        const el = document.getElementById('connectionStatus');
        el.textContent = state || "離線";
        el.className = state ? "status-online" : "status-offline";
    });

    database.ref(`statistics/${deviceId}`).on('value', (snapshot) => {
        const stats = snapshot.val() || {};
        document.getElementById('totalGames').textContent = stats.totalGames || 0;
        document.getElementById('highScore').textContent = stats.highScore || 0;
    });

    database.ref(`devices/${deviceId}/sessions`).orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
        const data = snapshot.val();
        scores = data ? Object.values(data).sort((a, b) => b.timestamp - a.timestamp) : [];
        updateDashboard();
    });
}

function updateDashboard() {
    const tbody = document.getElementById('recordsBody');
    tbody.innerHTML = '';
    if (scores.length > 0) {
        const latest = scores[0];
        document.getElementById('latestScore').textContent = latest.score;
        document.getElementById('latestMode').textContent = latest.mode === 'memory' ? '記憶模式' : '計數模式';
        document.getElementById('latestTime').textContent = new Date(latest.timestamp * 1000).toLocaleTimeString();
    }
    scores.forEach(record => {
        const row = tbody.insertRow();
        row.innerHTML = `<td>${new Date(record.timestamp * 1000).toLocaleString()}</td><td>${record.mode}</td><td>${record.score}</td><td>${record.duration}s</td><td>${record.sessionID || '-'}</td>`;
    });
    if (scoreChart) {
        const chartData = scores.slice(0, 10).reverse();
        scoreChart.data.labels = chartData.map(d => new Date(d.timestamp*1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}));
        scoreChart.data.datasets[0].data = chartData.map(d => d.score);
        scoreChart.update();
    }
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
}

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    initNoteBoard();
    loadDevices();
});

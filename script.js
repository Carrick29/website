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

let currentDevice = null;
let scoreChart = null;
let scores = [];

// 筆記本功能
function initNoteBoard() {
    const noteInput = document.getElementById('sysMsgInput');
    const saveBtn = document.getElementById('sendMsgBtn');
    const statusText = document.getElementById('currentMsg');
    database.ref('system_note').on('value', (snapshot) => {
        const val = snapshot.val();
        if (val) {
            if (!noteInput.value) noteInput.value = val.text || "";
            statusText.textContent = "最後更新: " + (val.time || "無記錄");
        }
    });
    saveBtn.onclick = () => {
        const text = noteInput.value;
        const now = new Date().toLocaleString();
        saveBtn.textContent = "儲存中...";
        database.ref('system_note').set({ text: text, time: now }).then(() => { saveBtn.textContent = "儲存"; });
    };
}

// 遠程控制
function setDifficulty(level) {
    if (!currentDevice) return;
    const cmdStatus = document.getElementById('cmdStatus');
    cmdStatus.textContent = "發送中...";
    database.ref(`devices/${currentDevice}/control/difficulty`).set(level)
        .then(() => { cmdStatus.textContent = "✅ 已發送"; setTimeout(() => { cmdStatus.textContent = ""; }, 3000); })
        .catch((e) => { cmdStatus.textContent = "❌ 失敗"; console.error(e); });
}

function initChart() {
    const ctx = document.getElementById('scoreChart').getContext('2d');
    if(scoreChart) scoreChart.destroy();
    scoreChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: '分數', data: [], borderColor: '#0277bd', backgroundColor: 'rgba(2,119,189,0.1)', borderWidth: 2, fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }
    });
}

function loadDevices() {
    const deviceList = document.getElementById('deviceList');
    database.ref('devices').on('value', (snapshot) => {
        const data = snapshot.val();
        deviceList.innerHTML = ''; 
        if (!data) { deviceList.innerHTML = '<div class="loading">無數據</div>'; return; }

        Object.keys(data).forEach(mac => {
            const btn = document.createElement('div');
            btn.className = 'device-chip' + (currentDevice === mac ? ' active' : '');
            
            // 嘗試讀取名字
            const name = data[mac].info?.name || mac;
            btn.innerHTML = `📡 ${name}`;
            
            btn.onclick = () => selectDevice(mac);
            deviceList.appendChild(btn);
        });
        if (!currentDevice && Object.keys(data).length > 0) selectDevice(Object.keys(data)[0]);
    });
}

function selectDevice(deviceId) {
    if (currentDevice) {
        database.ref(`devices/${currentDevice}/sessions`).off();
        database.ref(`statistics/${currentDevice}`).off();
        database.ref(`devices/${currentDevice}/status/difficulty`).off();
        database.ref(`devices/${currentDevice}/realtime/state`).off(); // 移除舊實時監聽
    }
    currentDevice = deviceId;
    
    document.getElementById('remoteControls').style.display = 'flex';
    document.querySelectorAll('.device-chip').forEach(el => {
        el.classList.remove('active');
        if(el.innerText.includes(deviceId)) el.classList.add('active');
    });

    // 監聽難度
    database.ref(`devices/${deviceId}/status/difficulty`).on('value', (snapshot) => {
        const val = snapshot.val();
        const badge = document.getElementById('currentDiff');
        if (val === 0) badge.textContent = "Easy";
        else if (val === 1) badge.textContent = "Hard";
        else if (val === 2) badge.textContent = "Auto";
        else badge.textContent = "Unknown";
    });

    // 監聽實時狀態 (顯示在空白框)
    database.ref(`devices/${deviceId}/realtime/state`).on('value', (snapshot) => {
        const state = snapshot.val();
        // 如果 Firebase 有值就顯示，否則顯示離線
        if (state) {
            document.getElementById('connectionStatus').textContent = state;
            document.getElementById('connectionStatus').className = "status-online";
        }
    });

    // 監聽統計
    database.ref(`statistics/${deviceId}`).on('value', (snapshot) => {
        const stats = snapshot.val() || {};
        document.getElementById('totalGames').textContent = stats.totalGames || 0;
        document.getElementById('highScore').textContent = stats.highScore || 0;
    });

    // 監聽記錄
    database.ref(`devices/${deviceId}/sessions`).orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) { document.getElementById('recordsBody').innerHTML = '<tr><td colspan="5" class="loading">無記錄</td></tr>'; return; }
        scores = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
        updateDashboard();
    });
}

function updateDashboard() {
    const tbody = document.getElementById('recordsBody');
    tbody.innerHTML = '';
    
    // 更新最新一局
    if (scores.length > 0) {
        const latest = scores[0];
        document.getElementById('latestScore').textContent = latest.score;
        let modeStr = latest.mode === 'memory' ? '記憶模式' : '計數模式';
        document.getElementById('latestMode').textContent = modeStr;
        document.getElementById('latestTime').textContent = new Date(latest.timestamp * 1000).toLocaleTimeString();
    }

    scores.forEach(record => {
        const row = tbody.insertRow();
        const date = record.timestamp ? new Date(record.timestamp * 1000) : new Date();
        let modeLabel = record.mode === 'memory' ? '記憶' : '計數';
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

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    initNoteBoard();
    loadDevices();
});
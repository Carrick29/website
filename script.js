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

function initChart() {
    const ctx = document.getElementById('scoreChart').getContext('2d');
    if (scoreChart) scoreChart.destroy();
    scoreChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: '分數', data: [], borderColor: '#0277bd', backgroundColor: 'rgba(2, 119, 189, 0.1)', borderWidth: 2, tension: 0.3, fill: true, pointBackgroundColor: '#fff', pointBorderColor: '#0277bd', pointRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f0f0f0' } }, x: { grid: { display: false } } } }
    });
}

// 設置難度
function setDifficulty(level) {
    if (!currentDevice) return;
    const cmdStatus = document.getElementById('cmdStatus');
    cmdStatus.textContent = "發送中...";
    
    // 寫入 /control/difficulty
    database.ref(`devices/${currentDevice}/control/difficulty`).set(level)
        .then(() => {
            cmdStatus.textContent = "✅ 已發送";
            setTimeout(() => { cmdStatus.textContent = ""; }, 3000);
        })
        .catch((e) => {
            cmdStatus.textContent = "❌ 失敗";
            console.error(e);
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
            btn.innerHTML = `📡 ${mac}`;
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
    }
    currentDevice = deviceId;
    
    document.getElementById('remoteControls').style.display = 'flex';
    document.querySelectorAll('.device-chip').forEach(el => {
        el.classList.remove('active');
        if(el.innerText.includes(deviceId)) el.classList.add('active');
    });

    // 監聽當前難度狀態
    database.ref(`devices/${deviceId}/status/difficulty`).on('value', (snapshot) => {
        const val = snapshot.val();
        const badge = document.getElementById('currentDiff');
        if (val === 0) badge.textContent = "簡單 (Easy)";
        else if (val === 1) badge.textContent = "困難 (Hard)";
        else if (val === 2) badge.textContent = "自動 (Auto)";
        else badge.textContent = "未知";
    });

    const statusEl = document.getElementById('connectionStatus');
    
    database.ref(`statistics/${deviceId}`).on('value', (snapshot) => {
        const stats = snapshot.val();
        if (stats) {
            document.getElementById('totalGames').textContent = stats.totalGames || 0;
            document.getElementById('highScore').textContent = stats.highScore || 0;
            document.getElementById('totalScore').textContent = stats.totalScore || 0;
        }
    });

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
    const statusEl = document.getElementById('connectionStatus');

    if (scores.length > 0) {
        const latest = scores[0];
        const lastActiveTime = new Date(latest.timestamp * 1000);
        const now = new Date();
        const diffMinutes = (now - lastActiveTime) / 1000 / 60; 

        if (diffMinutes < 5) {
            statusEl.textContent = '🟢 設備活躍中';
            statusEl.className = 'status-online';
        } else {
            statusEl.textContent = `🔴 設備離線 (${Math.floor(diffMinutes)}分前)`;
            statusEl.className = 'status-offline';
        }
        
        document.getElementById('latestScore').textContent = latest.score;
        document.getElementById('latestMode').textContent = latest.mode === 'memory' ? '記憶' : '計數';
        document.getElementById('latestTime').textContent = lastActiveTime.toLocaleTimeString();
    } else {
        statusEl.textContent = '⚪ 無數據';
    }

    scores.forEach(record => {
        const row = tbody.insertRow();
        const date = record.timestamp ? new Date(record.timestamp * 1000) : new Date();
        let modeLabel = record.mode === 'memory' ? '記憶' : '計數';
        row.innerHTML = `<td>${date.toLocaleString()}</td><td><span class="mode-badge">${modeLabel}</span></td><td><span class="score-badge">${record.score}</span></td><td>${record.duration}s</td><td style="font-family: monospace; color: #999; font-size: 0.8em">${record.sessionID}</td>`;
    });

    if (scoreChart) {
        const chartData = scores.slice(0, 10).reverse(); 
        scoreChart.data.labels = chartData.map(d => {
            const date = new Date(d.timestamp * 1000);
            return `${date.getHours()}:${date.getMinutes()}`;
        });
        scoreChart.data.datasets[0].data = chartData.map(d => d.score);
        scoreChart.update();
    }
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
}

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    loadDevices();
    setInterval(() => { if(scores.length > 0) updateDashboard(); }, 60000);
});
